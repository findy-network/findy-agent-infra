import { Template } from "aws-cdk-lib/assertions";

export default (template: Template) => {
  // TODO: avoid SourceObjectKeys hash changes
  const bucketDeploymentObject = template.findResources('Custom::CDKBucketDeployment');
  const keys = Object.keys(bucketDeploymentObject)
  if (keys.length > 0) {
    const bucketDeploymentKey = Object.keys(bucketDeploymentObject)[0]
    const json = template.toJSON()
    json.Resources[bucketDeploymentKey].Properties.SourceObjectKeys =
      json.Resources[bucketDeploymentKey].Properties.SourceObjectKeys.map((_: string, index: number) => `${index}.zip`)
  }

  const codePipelineObject = template.findResources('AWS::CodeBuild::Project');
  const cpKeys = Object.keys(codePipelineObject)
  cpKeys.map(item => {
    if (codePipelineObject[item].Properties.Source.BuildSpec.indexOf("cdk-assets --path") >= 0) {
      codePipelineObject[item].Properties.Source.BuildSpec = "{}"
    }
  })

  return template.toJSON()
}

