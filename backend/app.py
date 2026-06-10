import os
from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import numpy as np
import pandas as pd

app = Flask(__name__)
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
model_path = os.path.join(BASE_DIR, "best_model.pkl")
scaler_path = os.path.join(BASE_DIR, "scaler.pkl")
rul_model_path = os.path.join(BASE_DIR, "rul_model.pkl")

model  = joblib.load(model_path)
scaler = joblib.load(scaler_path)
rul_model = joblib.load(rul_model_path)

FEATURE_COLS = [
    "op_1", "op_2", "op_3",
    "sensor_2", "sensor_3", "sensor_4", "sensor_7", "sensor_9",
    "sensor_11", "sensor_12", "sensor_14", "sensor_17", "sensor_20", "sensor_21",
    "sensor_2_rmean",  "sensor_2_rstd",
    "sensor_3_rmean",  "sensor_3_rstd",
    "sensor_4_rmean",  "sensor_4_rstd",
    "sensor_7_rmean",  "sensor_7_rstd",
    "sensor_9_rmean",  "sensor_9_rstd",
    "sensor_11_rmean", "sensor_11_rstd",
    "sensor_12_rmean", "sensor_12_rstd",
    "sensor_14_rmean", "sensor_14_rstd",
    "sensor_17_rmean", "sensor_17_rstd",
    "sensor_20_rmean", "sensor_20_rstd",
    "sensor_21_rmean", "sensor_21_rstd",
]

LABEL_MAP = {0: "Normal", 1: "Warning", 2: "Critical"}


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/predict", methods=["POST"])
def predict():
    try:
        data = request.get_json()

        if not data:
            return jsonify({"error": "no input data provided"}), 400

        df = pd.DataFrame([data])

        missing = [col for col in FEATURE_COLS if col not in df.columns]
        if missing:
            return jsonify({"error": f"missing features: {missing}"}), 400

        df = df[FEATURE_COLS]

        scaled     = scaler.transform(df)
        prediction = model.predict(scaled)[0]
        proba      = model.predict_proba(scaled)[0]
        pred_rul   = max(0.0, float(rul_model.predict(scaled)[0]))

        return jsonify({
            "prediction"  : int(prediction),
            "label"       : LABEL_MAP[int(prediction)],
            "probability" : {
                "Normal"   : round(float(proba[0]), 4),
                "Warning"  : round(float(proba[1]), 4),
                "Critical" : round(float(proba[2]), 4),
            },
            "rul"         : int(round(pred_rul))
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/predict_batch", methods=["POST"])
def predict_batch():
    try:
        data = request.get_json()

        if not data or not isinstance(data, list):
            return jsonify({"error": "input data must be a list of rows"}), 400

        df = pd.DataFrame(data)

        missing = [col for col in FEATURE_COLS if col not in df.columns]
        if missing:
            return jsonify({"error": f"missing features: {missing}"}), 400

        df = df[FEATURE_COLS]

        scaled = scaler.transform(df)
        predictions = model.predict(scaled)
        probabilites = model.predict_proba(scaled)
        ruls = rul_model.predict(scaled)

        results = []
        for pred, proba, r_val in zip(predictions, probabilites, ruls):
            results.append({
                "prediction": int(pred),
                "label": LABEL_MAP[int(pred)],
                "probability": {
                    "Normal": round(float(proba[0]), 4),
                    "Warning": round(float(proba[1]), 4),
                    "Critical": round(float(proba[2]), 4),
                },
                "rul": int(max(0, round(float(r_val))))
            })

        return jsonify({"results": results})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True, port=5000)