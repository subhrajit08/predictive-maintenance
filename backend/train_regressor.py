import os
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import StandardScaler
import joblib

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)
DATA_PATH = os.path.join(ROOT_DIR, "data", "train_FD001.txt")
MODEL_OUT_PATH = os.path.join(BASE_DIR, "rul_model.pkl")

print(f"Reading data from {DATA_PATH}...")
columns = ['unit', 'cycle', 'op_1', 'op_2', 'op_3'] + [f'sensor_{i}' for i in range(1, 22)]
df = pd.read_csv(DATA_PATH, sep=r'\s+', header=None, names=columns)

# Calculate RUL
rul = df.groupby('unit')['cycle'].max().reset_index()
rul.columns = ['unit', 'max_cycle']
df = df.merge(rul, on='unit', how='left')
df['RUL'] = df['max_cycle'] - df['cycle']
df.drop('max_cycle', axis=1, inplace=True)

SIGNAL_SENSORS = [2, 3, 4, 7, 9, 11, 12, 14, 17, 20, 21]
FEATURE_COLS = ['op_1', 'op_2', 'op_3']
for s in SIGNAL_SENSORS:
    FEATURE_COLS.append(f'sensor_{s}')

# Compute rolling stats (window=5) group by unit
for s in SIGNAL_SENSORS:
    col = f'sensor_{s}'
    df[f'{col}_rmean'] = df.groupby('unit')[col].transform(lambda x: x.rolling(5, min_periods=1).mean())
    df[f'{col}_rstd'] = df.groupby('unit')[col].transform(lambda x: x.rolling(5, min_periods=1).std().fillna(0))
    FEATURE_COLS.append(f'{col}_rmean')
    FEATURE_COLS.append(f'{col}_rstd')

X = df[FEATURE_COLS]
y = df['RUL']

# Fit scaler and regressor
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

print("Training RandomForestRegressor model...")
reg = RandomForestRegressor(n_estimators=30, max_depth=12, random_state=42, n_jobs=-1)
reg.fit(X_scaled, y)

print(f"Saving model to {MODEL_OUT_PATH}...")
joblib.dump(reg, MODEL_OUT_PATH)
print("Regression model trained and saved successfully!")
