#!/bin/sh
set -eu

: "${PORT:=8000}"
: "${ANON_MODEL_PATH:=weights/panoramax/model.pt}"

if [ ! -f "$ANON_MODEL_PATH" ] && [ -n "${ANON_MODEL_URL:-}" ]; then
  echo "Downloading anonymizer weights to ${ANON_MODEL_PATH}"
  mkdir -p "$(dirname "$ANON_MODEL_PATH")"
  if [ -n "${HF_TOKEN:-}" ]; then
    curl -fsSL -H "Authorization: Bearer ${HF_TOKEN}" "$ANON_MODEL_URL" -o "$ANON_MODEL_PATH"
  else
    curl -fsSL "$ANON_MODEL_URL" -o "$ANON_MODEL_PATH"
  fi
fi

exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
