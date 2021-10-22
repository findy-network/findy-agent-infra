#!/bin/bash

set -e

cdk deploy --require-approval never --outputs-file output.json FindyAgency/GRPCSCert

output=$(cat output.json)

echo "CDK output: $output"

certArn=$(node -pe 'const res = JSON.parse(process.argv[1]);const key = Object.keys(res).find(i => i.startsWith("FindyAgencyGRPCSCert"));res[key].certificateArn' "$output")

echo "Cert ARN: $certArn"

res=$(docker run --rm -it \
    -e AWS_PAGER="" \
    -e AWS_DEFAULT_REGION=$AWS_DEFAULT_REGION \
    -e AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID \
    -e AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY amazon/aws-cli \
    acm get-certificate --certificate-arn $certArn --output text)

# using now the default certs and just copying the server public cert from AWS
rm -rf .secrets/grpc
cp -R ./default_cert .secrets/grpc
echo $res > .secrets/grpc/server/server.crt

# TODO: do not use grpcs internally in agency -> no need to copy these cert files to s3