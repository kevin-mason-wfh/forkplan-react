#!/usr/bin/env bash
# Build and deploy Forkplan Web to AWS Amplify Hosting (manual deploy, no Git needed).
# Uses your normal AWS credentials (env vars or ~/.aws). Re-run to redeploy; the app id is remembered.
#   ./deploy.sh                                 # dev environment (app forkplan-web-dev, branch dev)
#   ENV_NAME=prod ./deploy.sh                   # later: production (app forkplan-web-prod, branch prod)
#   BASIC_AUTH="user:password" ./deploy.sh      # optionally protect the site with a password
#   FORKPLAN_API=https://.../dev AWS_REGION=eu-west-2 ./deploy.sh
set -euo pipefail
cd "$(dirname "$0")"

REGION="${AWS_REGION:-eu-west-2}"
API="${FORKPLAN_API:-https://kt7490x9c3.execute-api.eu-west-2.amazonaws.com/dev}"
ENV_NAME="${ENV_NAME:-dev}"            # dev (default) | prod
NAME="${APP_NAME:-forkplan-web-${ENV_NAME}}"; BRANCH="${BRANCH:-$ENV_NAME}"
STAGE=DEVELOPMENT; [[ "$ENV_NAME" == "prod" ]] && STAGE=PRODUCTION
ID_FILE=".amplify-app-id.${ENV_NAME}"
command -v aws >/dev/null || { echo "aws CLI not found (brew install awscli)"; exit 1; }
command -v zip >/dev/null || { echo "zip not found"; exit 1; }
aws sts get-caller-identity --region "$REGION" --query Account --output text >/dev/null || { echo "AWS credentials not working"; exit 1; }

echo "▶ Building…"
npm ci
npm run build

if [[ -f "$ID_FILE" ]]; then APP_ID="$(cat "$ID_FILE")"; else
  echo "▶ Creating Amplify app…"
  APP_ID="$(aws amplify create-app --name "$NAME" --region "$REGION" --query app.appId --output text)"
  echo "$APP_ID" > "$ID_FILE"
  aws amplify create-branch --app-id "$APP_ID" --branch-name "$BRANCH" --stage "$STAGE" --region "$REGION" >/dev/null
fi

echo "▶ Configuring /api proxy rewrite → $API"
aws amplify update-app --app-id "$APP_ID" --region "$REGION" \
  --custom-rules "[{\"source\":\"/api/<*>\",\"target\":\"${API}/<*>\",\"status\":\"200\"},{\"source\":\"</^[^.]+$|\\\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webp)$)([^.]+$)/>\",\"target\":\"/index.html\",\"status\":\"200\"}]" >/dev/null

if [[ -n "${BASIC_AUTH:-}" ]]; then
  echo "▶ Enabling basic auth"
  aws amplify update-branch --app-id "$APP_ID" --branch-name "$BRANCH" --region "$REGION" \
    --enable-basic-auth --basic-auth-credentials "$(printf '%s' "$BASIC_AUTH" | base64)" >/dev/null
fi

echo "▶ Uploading…"
rm -f dist.zip; (cd dist && zip -qr ../dist.zip .)
read -r JOB_ID UPLOAD_URL < <(aws amplify create-deployment --app-id "$APP_ID" --branch-name "$BRANCH" --region "$REGION" --query '[jobId,zipUploadUrl]' --output text)
curl -fsS -T dist.zip "$UPLOAD_URL" >/dev/null
aws amplify start-deployment --app-id "$APP_ID" --branch-name "$BRANCH" --job-id "$JOB_ID" --region "$REGION" >/dev/null

for _ in $(seq 1 60); do
  STATUS="$(aws amplify get-job --app-id "$APP_ID" --branch-name "$BRANCH" --job-id "$JOB_ID" --region "$REGION" --query job.summary.status --output text)"
  [[ "$STATUS" == "SUCCEED" ]] && break
  [[ "$STATUS" == "FAILED" || "$STATUS" == "CANCELLED" ]] && { echo "Deployment $STATUS"; exit 1; }
  sleep 5
done
rm -f dist.zip
echo; echo "✅ Live at: https://${BRANCH}.${APP_ID}.amplifyapp.com"
