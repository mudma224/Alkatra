#!/usr/bin/env python3
"""
Smoke test d'intégration ML : démarre la stack si nécessaire, envoie un message
simulateur, vérifie MLflow, iot-service, Kafka topics et les logs du job Spark.

Usage: python scripts/smoke_ml_integration.py
"""
import subprocess
import sys
import time
import os
import urllib.request
import re

ROOT = os.path.dirname(os.path.dirname(__file__))
DOCKER_COMPOSE_FILE = os.path.join(ROOT, 'infra', 'docker', 'docker-compose.yml')


def run(cmd, timeout=120, check=False, capture_output=True):
    try:
        res = subprocess.run(cmd, timeout=timeout, check=False, capture_output=capture_output, text=True)
        if check and res.returncode != 0:
            raise RuntimeError(f"Command failed: {cmd}\nstdout:\n{res.stdout}\nstderr:\n{res.stderr}")
        return res.returncode, res.stdout, res.stderr
    except subprocess.TimeoutExpired as e:
        raise


def http_get_text(url, timeout=5):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return r.read().decode('utf-8', errors='ignore')
    except Exception as e:
        return None


def ensure_compose_up():
    # Check if spark container exists
    code, out, err = run(['docker', 'ps', '--filter', 'name=alkatra-spark', '--format', '{{.Names}}||{{.Status}}'])
    if out.strip():
        print('Container alkatra-spark running or present:', out.strip())
        return True

    print('Spark container not found, starting stack (this may take a while)...')
    # Start compose
    cmd = ['docker', 'compose', '-f', DOCKER_COMPOSE_FILE, 'up', '--build', '-d']
    run(cmd, timeout=600, check=True)

    # wait for spark container
    deadline = time.time() + 180
    while time.time() < deadline:
        code, out, err = run(['docker', 'ps', '--filter', 'name=alkatra-spark', '--format', '{{.Names}}||{{.Status}}'])
        if out.strip():
            print('Spark container now present:', out.strip())
            return True
        time.sleep(5)
    print('Timeout waiting for spark container')
    return False


def check_mlflow():
    print('Checking MLflow at http://localhost:5000/health')
    txt = http_get_text('http://localhost:5000/health')
    if txt is None:
        txt = http_get_text('http://localhost:5000/')
    if txt is None:
        print('MLflow not reachable on http://localhost:5000')
        return False
    print('MLflow reachable')
    return True


def trigger_simulator(duration_s=12):
    print('Starting simulate-sensor.js to publish one message (will run briefly)...')
    node = 'node'
    script = os.path.join(ROOT, 'scripts', 'simulate-sensor.js')
    proc = subprocess.Popen([node, script, '60000'], cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    try:
        # capture some output lines for debugging
        start = time.time()
        while time.time() - start < duration_s:
            line = proc.stdout.readline()
            if not line:
                time.sleep(0.5)
                continue
            print('[simulator]', line.strip())
            # if we see the send log, we can stop earlier
            if 'Erreurs' in line or 'Erreur' in line:
                break
        # terminate simulator
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()
    print('Simulator finished')


def check_iot_metrics():
    print('Checking iot-service metrics at http://localhost:3005/metrics')
    txt = http_get_text('http://localhost:3005/metrics')
    if txt is None:
        print('iot-service metrics not reachable')
        return False
    received = re.search(r'alkatra_iot_messages_received_total\s+(\d+)', txt)
    forwarded = re.search(r'alkatra_iot_messages_forwarded_total\s+(\d+)', txt)
    print('metrics sample:', received.group(1) if received else 'N/A', 'received |', forwarded.group(1) if forwarded else 'N/A', 'forwarded')
    return True


def check_kafka_topics():
    print('Listing Kafka topics inside container alkatra-kafka')
    cmd = ['docker', 'exec', 'alkatra-kafka', '/opt/kafka/bin/kafka-topics.sh', '--bootstrap-server', 'localhost:9092', '--list']
    code, out, err = run(cmd, timeout=30)
    if code != 0:
        print('Failed to list Kafka topics:', err)
        return False
    topics = out.strip().splitlines()
    print('Topics:', topics)
    ok = 'raw-sensor-data' in topics or 'processed-sensor-data' in topics
    return ok


def check_spark_logs():
    print('Fetching last logs from alkatra-spark')
    code, out, err = run(['docker', 'logs', 'alkatra-spark', '--tail', '200'], timeout=30)
    if code != 0:
        print('Failed to get spark logs')
        return False
    # look for stream start or batch info
    if 'Stream actif' in out or 'en attente de messages' in out or 'Batch' in out or 'processed-sensor-data' in out:
        print('Spark logs indicate stream is active or processed messages')
        # print a few matching lines
        for line in out.splitlines():
            if 'Batch' in line or 'processed-sensor-data' in line or 'Stream actif' in line:
                print('[spark]', line)
        return True
    print('No clear evidence of Spark processing in logs')
    return False


def main():
    ok = True

    if not ensure_compose_up():
        print('Failed to ensure docker compose is up')
        sys.exit(1)

    ok &= check_mlflow()

    # Give some time for services to settle
    print('Waiting 8s for services to settle...')
    time.sleep(8)

    trigger_simulator(duration_s=12)

    # wait a bit for pipeline
    print('Waiting 8s for pipeline processing...')
    time.sleep(8)

    ok &= check_iot_metrics()
    ok &= check_kafka_topics()
    ok &= check_spark_logs()

    if ok:
        print('\nSMOKE TEST: SUCCESS — pipeline looks healthy')
        sys.exit(0)
    else:
        print('\nSMOKE TEST: FAILURE — see logs above')
        sys.exit(2)


if __name__ == '__main__':
    main()
