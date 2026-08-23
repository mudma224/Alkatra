"""
Tests unitaires — stream_metrics.py (push PushGateway mocké, sans réseau).
"""
from unittest.mock import patch

from jobs import stream_metrics


def test_push_batch_metrics_noop_without_url(capsys):
    """PUSHGATEWAY_URL vide → aucune tentative réseau, aucune erreur."""
    with patch.object(stream_metrics, "PUSHGATEWAY_URL", ""):
        stream_metrics.push_batch_metrics(epoch_id=1, input_rows=5, output_rows=4, rejected=1, duration_seconds=0.42)
    # Les gauges restent valorisées localement (pas d'exception = OK)
    assert stream_metrics.BATCH_ID._value.get() == 1.0
    assert stream_metrics.INPUT_ROWS._value.get() == 5.0
    assert stream_metrics.OUTPUT_ROWS._value.get() == 4.0
    assert stream_metrics.REJECTED_MESSAGES._value.get() == 1.0


def test_push_batch_metrics_pushes_to_gateway():
    """PUSHGATEWAY_URL défini → un push par batch avec le grouping key instance."""
    with patch.object(stream_metrics, "PUSHGATEWAY_URL", "http://pushgateway:9091"):
        with patch("jobs.stream_metrics.push_to_gateway") as mock_push:
            stream_metrics.push_batch_metrics(epoch_id=7, input_rows=10, output_rows=9, rejected=1, duration_seconds=1.5)

    mock_push.assert_called_once()
    _, kwargs = mock_push.call_args
    assert kwargs["job"] == stream_metrics.JOB_NAME
    assert kwargs["grouping_key"] == {"instance": stream_metrics.INSTANCE}


def test_push_batch_metrics_swallows_push_errors():
    """Un push qui échoue ne doit jamais casser le traitement du batch."""
    with patch.object(stream_metrics, "PUSHGATEWAY_URL", "http://pushgateway:9091"):
        with patch("jobs.stream_metrics.push_to_gateway", side_effect=OSError("network down")):
            stream_metrics.push_batch_metrics(epoch_id=2, input_rows=0, output_rows=0, rejected=0, duration_seconds=0.1)
    # Pas d'exception propagée — le test passe si on arrive ici.
