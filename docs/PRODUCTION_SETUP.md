# Setting up Production (to do later)

Only **dev** exists today. This is the checklist for adding **prod** when ready.
Account `975046659930`, region `eu-west-2`, repo `kevin-mason-wfh/forkplan-react`.

## Current dev setup (reference)

| Item | Value |
|---|---|
| Amplify app | `forkplan-web-dev` (`d2uc15t23lyyjz`), branch `dev`, stage `DEVELOPMENT` |
| IAM role | `forkplan-web-ci-dev-deploy` (trusts GitHub environment `dev` only) |
| GitHub environment `dev` vars | `AMPLIFY_APP_ID`, `AWS_DEPLOY_ROLE_ARN`, `FORKPLAN_API`, `VITE_IMAGE_BASE` |
| Trigger | merge to `main` deploys to dev |

## Release model

Production deploys only when you **publish a GitHub Release** whose tag points at `main`,
and only after a reviewer approves the `production` environment.

```
gh release create v1.0.0 --target main --generate-notes
```

## Steps

### 1. Production backend API
Decide the prod API Gateway URL. The default in `deploy.sh` and `vite.config.js` is the `/dev` stage, so do not reuse it for prod.

### 2. Create the prod Amplify app
```
ENV_NAME=prod FORKPLAN_API=https://<prod-api>/<stage> bash deploy.sh
```
This creates `forkplan-web-prod`, branch `prod`, stage `PRODUCTION`, and the `/api` proxy and SPA rewrite rules, and writes the app ID to `.amplify-app-id.prod`.
Note the app ID. Consider `BASIC_AUTH` until launch, and a custom domain in the Amplify console.

### 3. Create the prod IAM role
Same OIDC provider (already exists). Replace `<PROD_APP_ID>`.

```
cat > trust-prod.json <<'EOF'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow",
 "Principal":{"Federated":"arn:aws:iam::975046659930:oidc-provider/token.actions.githubusercontent.com"},
 "Action":"sts:AssumeRoleWithWebIdentity",
 "Condition":{"StringEquals":{
  "token.actions.githubusercontent.com:aud":"sts.amazonaws.com",
  "token.actions.githubusercontent.com:sub":"repo:kevin-mason-wfh/forkplan-react:environment:production"}}}]}
EOF

cat > policy-prod.json <<'EOF'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow",
 "Action":["amplify:CreateDeployment","amplify:StartDeployment","amplify:GetJob","amplify:GetBranch"],
 "Resource":["arn:aws:amplify:eu-west-2:975046659930:apps/<PROD_APP_ID>",
             "arn:aws:amplify:eu-west-2:975046659930:apps/<PROD_APP_ID>/*"]}]}
EOF

aws iam create-role --role-name forkplan-web-ci-prod-deploy --assume-role-policy-document file://trust-prod.json
aws iam put-role-policy --role-name forkplan-web-ci-prod-deploy --policy-name amplify-deploy-prod --policy-document file://policy-prod.json
```

### 4. GitHub environment `production`
Settings, Environments, New environment `production`:

| Variable | Value |
|---|---|
| `AMPLIFY_APP_ID` | prod app ID from step 2 |
| `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::975046659930:role/forkplan-web-ci-prod-deploy` |
| `FORKPLAN_API` | prod API URL |
| `VITE_IMAGE_BASE` | prod image CDN URL |

Protection: enable **Required reviewers** (you), tick "Prevent self-review" only if you have a second reviewer, and set **Deployment branches and tags** to selected tags matching `v*`.

### 5. Repo protection
- Ruleset on `main`: require PR and the `CI` check to pass.
- Tag ruleset on `v*`: restrict creation to admins.

### 6. Release workflow
`.github/workflows/release.yml` should:
- trigger on `release: types: [published]` (not tag push);
- fail unless the tagged commit is reachable from `origin/main`;
- use `environment: production` for the deploy job and read the vars above (the Amplify branch `prod` is hardcoded, not a variable);
- attach the built zip to the existing release instead of creating a new one.

### 7. First release
Verify dev, then `gh release create v1.0.0 --target main --generate-notes`, approve the deployment, and smoke test the prod URL.

## Rollback
Re-run the workflow for the previous release, or in the Amplify console redeploy a previous build of the `prod` branch.
