#!/bin/bash

if [ -z "$FINDY_AWS_ECS_AGENCY_CERT_ARN" ]; then
  echo "ERROR: Define env variable FINDY_AWS_ECS_AGENCY_CERT_ARN"
  exit 1
fi

res=$(docker run --rm -it \
    -e AWS_PAGER="" \
    -e AWS_DEFAULT_REGION=$AWS_DEFAULT_REGION \
    -e AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID \
    -e AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY amazon/aws-cli \
    acm get-certificate --certificate-arn $FINDY_AWS_ECS_AGENCY_CERT_ARN --output text)

# using now the default certs and just copying the server public cert from AWS
mkdir -p .secrets
cp -R ./default_cert .secrets/grpc
echo $res > .secrets/grpc/server/server.crt

# TODO: do not use grpcs internally in agency -> no need to copy these cert files to s3