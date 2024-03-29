#!/bin/bash

# Stores parameters needed for pipeline to run successfully

genesis_file_path=$1
genesis_content="no_genesis_needed"

if [ -z "$genesis_file_path" ]; then
  echo "WARNING: Genesis file path not given, assuming FILE LEDGER in use"
else
  genesis_content="$(cat $genesis_file_path)"
fi

if [ -z "$APPLE_ASSOCIATED_APPS" ]; then
  echo "WARNING: No Apple associated apps defined"
fi

if [ -z "$ANDROID_PACKAGE_NAME" ]; then
  echo "WARNING: No Android package name defined"
fi

if [ -z "$ANDROID_PACKAGE_DOMAIN" ]; then
  echo "WARNING: No Android domain defined"
fi

if [ -z "$ANDROID_PACKAGE_FINGERPRINT" ]; then
  echo "WARNING: No Android fingerprint defined"
fi

if [ -z "$ANDROID_APP_ORIGIN" ]; then
  echo "WARNING: No Android app origin defined"
fi

if [ -z "$GITHUB_CONNECTION_ARN" ]; then
  echo "ERROR: Define env variable GITHUB_CONNECTION_ARN"
  exit 1
fi

if [ -z "$DOMAIN_NAME" ]; then
  echo "ERROR: Define env variable DOMAIN_NAME"
  exit 1
fi

if [ -z "$SUB_DOMAIN_NAME" ]; then
  echo "ERROR: Define env variable SUB_DOMAIN_NAME"
  exit 1
fi

if [ -z "$API_SUB_DOMAIN_NAME" ]; then
  echo "ERROR: Define env variable API_SUB_DOMAIN_NAME"
  exit 1
fi

aws ssm put-parameter --name "/findy-agency/github-connection-arn" --value "$GITHUB_CONNECTION_ARN" --type String
aws ssm put-parameter --name "/findy-agency/domain-name" --value "$DOMAIN_NAME" --type String
aws ssm put-parameter --name "/findy-agency/sub-domain-name" --value "$SUB_DOMAIN_NAME" --type String
aws ssm put-parameter --name "/findy-agency/api-sub-domain-name" --value "$API_SUB_DOMAIN_NAME" --type String
aws ssm put-parameter --name "/findy-agency/genesis" --value "$genesis_content" --type String
aws ssm put-parameter --name "/findy-agency/apple-associated-apps" --value "$APPLE_ASSOCIATED_APPS" --type String
