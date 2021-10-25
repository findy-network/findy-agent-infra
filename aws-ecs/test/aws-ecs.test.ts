/* eslint-disable jest/expect-expect */
import { SynthUtils } from '@aws-cdk/assert';
import { HostedZone } from '@aws-cdk/aws-route53';
import * as cdk from '@aws-cdk/core';
import { CIPipelineStack } from '../lib/ci-pipeline';
import { DeploymentStack } from '../lib/deployment';

const id = 'CIPipelineStack';

const defaultProps = {
  env: {
    region: 'us-east-1',
    account: '123456789'
  },
  prod: false,
  githubConnectionArn: 'githubConnectionArn',
  walletDomainName: 'agency.example.com',
  domainRoot: 'example.com',
  apiDomainName: 'agency-api.example.com',
  configSecretName: 'configSecretName',
  containerNames: {
    auth: `${id}AuthContainer`,
    agent: `${id}AgentContainer`,
    vault: `${id}VaultContainer`
  },
  agencyAddress: 'agency-api.example.com'
};

test('Pipeline Stack', () => {
  const app = new cdk.App();
  // WHEN
  const stack = new CIPipelineStack(app, id, defaultProps);
  // THEN
  expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
});

// TODO: add more tests
