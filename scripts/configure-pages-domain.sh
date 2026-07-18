#!/usr/bin/env bash
# Idempotently associate the canonical domain with a Cloudflare Pages project.
# Usage: ./scripts/configure-pages-domain.sh <project_name> <domain_name>

set -euo pipefail

PROJECT_NAME="${1:?Usage: $0 <project_name> <domain_name>}"
DOMAIN_NAME="${2:?Usage: $0 <project_name> <domain_name>}"
: "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID is required}"
: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN is required}"

if [[ ! "$PROJECT_NAME" =~ ^[a-z0-9-]+$ ]] ||
	[[ ! "$DOMAIN_NAME" =~ ^[a-z0-9.-]+$ ]]; then
	echo "ERROR: invalid Pages project or domain name." >&2
	exit 1
fi

api="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects/${PROJECT_NAME}/domains"
authorization="Authorization: Bearer ${CLOUDFLARE_API_TOKEN}"

status=$(
	curl --silent --show-error --output /dev/null --write-out "%{http_code}" \
		--header "$authorization" \
		"$api/$DOMAIN_NAME"
)

if [ "$status" = "200" ]; then
	echo "Cloudflare Pages domain $DOMAIN_NAME is already associated."
	exit 0
fi

if [ "$status" != "404" ]; then
	echo "ERROR: Cloudflare domain lookup returned HTTP $status." >&2
	exit 1
fi

curl --silent --show-error --fail-with-body --output /dev/null \
	--request POST \
	--header "$authorization" \
	--header "Content-Type: application/json" \
	--data "{\"name\":\"${DOMAIN_NAME}\"}" \
	"$api"

echo "Cloudflare Pages domain $DOMAIN_NAME was associated with $PROJECT_NAME."
