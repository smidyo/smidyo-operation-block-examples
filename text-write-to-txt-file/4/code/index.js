const fetch = require('node-fetch');
const AWS = require('aws-sdk');
const LambdaService = new AWS.Lambda();

exports.handler = async ({ payload, getTempPayloadletFileUploadURLsFunctionARN }) => {
  const [text] = payload["text"];
  const [originalFilename] = payload["filename"] || ["text.txt"];

  const uploadURLRes = await LambdaService.invoke({
    FunctionName: getTempPayloadletFileUploadURLsFunctionARN,
    Payload: JSON.stringify({ forFiles: [{ extension: "txt" }] }),
  }).promise();
  const [uploadInfo] = JSON.parse(uploadURLRes.Payload);
  await fetch(uploadInfo.uploadURL, { method: "PUT", body: text });

  return {
    type: "OPERATION_BLOCK_RESULT_OUTCOME",
    result: {
      file: [
        {
          file: uploadInfo.fileKey,
          originalFilename,
        },
      ],
    },
  };
};
