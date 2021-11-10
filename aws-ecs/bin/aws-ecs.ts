#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import {
  FindyAgencyStack,
  FindyAgencyStackProps
} from '../lib/findy-agency-stack';
import { existsSync } from 'fs';
import { exit } from 'process';

const missing = ['.secrets/agent/genesis_transactions'].find(
  (item) => !existsSync(item)
);
if (missing != null) {
  console.warn(
    `Create folder .secrets and copy needed agency configuration files there.`
  );
  console.warn(
    `* .secrets/agent/genesis_transactions: Genesis transcations for ledger *\n`
  );
  exit(1);
}

// TODO: use tryGetContext instead of env variables?
const params = {
  FINDY_AWS_ECS_WALLET_DOMAIN_NAME: {
    variable: 'walletDomainName',
    description: 'the domain name for the web wallet, e.g. wallet.example.com'
  },
  FINDY_AWS_ECS_GITHUB_CONNECTION_ARN: {
    variable: 'githubConnectionArn',
    description:
      'the GitHub connection arn, see https://docs.aws.amazon.com/dtconsole/latest/userguide/connections-create-github.html'
  },
  FINDY_AWS_ECS_CONFIG_SECRET_NAME: {
    variable: 'configSecretName',
    description:
      'the name of the secret for container configuation json, e.g. FindyAgencyConfig'
  },
  FINDY_AWS_ECS_DOMAIN_ROOT: {
    variable: 'domainRoot',
    description: 'the domain root for hosted zone lookup, e.g. example.com'
  },
  FINDY_AWS_ECS_API_DOMAIN_NAME: {
    variable: 'apiDomainName',
    description: 'the domain name for agency API, e.g. agency.example.com'
  }
};

const props = Object.keys(params).reduce(
  (result, item) => {
    // @ts-expect-error
    const current = params[item] as { description: string };
    if (process.env[item] == null) {
      console.log(`Define env variable ${item}, ${current.description}`);
      process.exit(1);
    }
    // @ts-expect-error
    result[current.variable] = process.env[item];
    return result;
  },
  {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION
    },
    prod: false
  }
);

const app = new cdk.App();
new FindyAgencyStack(app, 'FindyAgency', props as FindyAgencyStackProps);
