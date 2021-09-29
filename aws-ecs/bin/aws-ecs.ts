#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { FindyAgencyStack } from '../lib/findy-agency-stack';

if (!process.env.WALLET_DOMAIN_NAME) {
  console.log(
    'Define env variable WALLET_DOMAIN_NAME, the domain name for the web wallet, e.g. wallet.example.com'
  );
  process.exit(1);
}

if (!process.env.GITHUB_SECRET_NAME) {
  console.log(
    'Define env variable GITHUB_SECRET_NAME, the name of the secret for GitHub access, e.g. FindyAgencyGitHubAccess'
  );
  process.exit(1);
}

const walletDomainName = `${process.env.WALLET_DOMAIN_NAME}`;
const githubSecretName = `${process.env.GITHUB_SECRET_NAME}`;

const app = new cdk.App();
new FindyAgencyStack(app, 'FindyAgency', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  },
  prod: false,
  walletDomainName,
  githubTokenSecretName: githubSecretName
});
