import mlflow
import os
os.environ['MLFLOW_S3_ENDPOINT_URL'] = 'http://minio:9000'
mlflow.set_tracking_uri('http://mlflow:5001')
try:
    clf = mlflow.xgboost.load_model('models:/AlKatra-Classifier/Production')
    print('✓✓✓ CLASSIFIER LOADED FROM S3 ✓✓✓')
    reg = mlflow.xgboost.load_model('models:/AlKatra-Regressor/Production')
    print('✓✓✓ REGRESSOR LOADED FROM S3 ✓✓✓')
    print('\n✅ OPTION C COMPLETE - Models load from MinIO S3 backend!')
except Exception as e:
    import traceback
    print(f'✗ {type(e).__name__}')
    traceback.print_exc()
