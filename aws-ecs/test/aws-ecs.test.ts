import {
  expect as expectCDK,
  matchTemplate,
  MatchStyle
} from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import * as AwsEcs from '../lib/findy-agency-stack';

const defaultProps = {
  env: {},
  prod: false,
  githubTokenSecretName: 'githubTokenSecretName',
  walletDomainName: 'walletDomainName'
};

test('Empty Stack', () => {
  const app = new cdk.App();
  // WHEN
  const stack = new AwsEcs.FindyAgencyStack(app, 'MyTestStack', defaultProps);
  // THEN
  expectCDK(stack).to(
    matchTemplate(
      {
        Resources: {}
      },
      MatchStyle.EXACT
    )
  );
});
