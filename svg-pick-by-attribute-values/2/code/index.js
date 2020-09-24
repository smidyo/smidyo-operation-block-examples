//@ts-check

const fetch = require('node-fetch');
const { Builder, Parser } = require('xml2js');
//@ts-ignore
const AWS = require('aws-sdk');
const LambdaService = new AWS.Lambda();

const setObjectProperty = (obj, path, value = null) => {
  let current = obj;
  while (path.length > 1) {
    const [head, ...tail] = path;
    path = tail;
    if (current[head] === undefined) {
      if (isNaN(tail[0])) current[head] = {};
      else current[head] = [];
    }
    current = current[head];
  }
  if (isNaN(path[0])) current[path[0]] = value;
  else current.push(value);

  return obj;
};

exports.handler = async ({
  payload,
  tempPayloadletFilesDomain,
  getTempPayloadletFileUploadURLsFunctionARN
}) => {
  const svgs = payload['svg'];
  const values1 = payload['values-set-1'];
  const values2 = payload['values-set-2'] || [null];
  const values3 = payload['values-set-3'] || [null];
  const [attribute] = payload['attribute'];

  try {
    const svgSets = await Promise.all(
      svgs.map(async svg => {
        //@ts-ignore
        const svgData = await fetch(
          'https://' + tempPayloadletFilesDomain + '/' + svg.svg
        ).then(res => res.text());

        const parser = new Parser();

        const svgObject = await new Promise((resolve, reject) => {
          parser.parseString(svgData, (convertError, object) => {
            if (convertError) {
              console.log(convertError);
              reject(convertError);
            }
            return resolve(object);
          });
        });
        const sets = await Promise.all(
          [values1, values2, values3].map(async values => {
            const setObject = {};
            const iterate = (node, path) => {
              const parentArray = path[path.length - 2];
              const parent = path[path.length - 1];
              if (parentArray === 'svg' && parent === '$') {
                setObjectProperty(setObject, path, node);
              }
              if (parentArray === 'g') {
                setObjectProperty(setObject, [...path, '$'], node.$);
              }
              Object.entries(node).forEach(([key, value]) => {
                if (typeof value === 'object') {
                  return iterate(value, [...path, key]);
                } else if (key === attribute && values.includes(value)) {
                  setObjectProperty(setObject, path, node);
                }
              });
            };

            iterate(svgObject, []);

            const builder = new Builder();
            const newSVGData = builder.buildObject(setObject);
            const uploadURLRes = await LambdaService.invoke({
              FunctionName: getTempPayloadletFileUploadURLsFunctionARN,
              Payload: JSON.stringify({ forFiles: [{ extension: 'svg' }] })
            }).promise();

            const [uploadInfo] = JSON.parse(uploadURLRes.Payload);

            //@ts-ignore
            await fetch(uploadInfo.uploadURL, { method: 'PUT', body: newSVGData });

            return {
              svg: uploadInfo.fileKey,
              originalFilename: svg.originalFilename,
              unit: svg.unit
            };
          })
        );

        return sets;
      })
    );

    const result = {
      type: 'OPERATION_BLOCK_RESULT_OUTCOME',
      result: {
        'svg-set-1': [],
        'svg-set-2': [],
        'svg-set-3': []
      }
    };

    for (const [s1, s2, s3] of svgSets) {
      result.result['svg-set-1'].push(s1);
      result.result['svg-set-2'].push(s2);
      result.result['svg-set-3'].push(s3);
    }

    return result;
  } catch (err) {
    console.log(err);
    return {
      type: 'REJECTION_OUTCOME',
      rejection: "Could not pick paths from SVG's",
      error: {
        message: err.message,
        stack: err.stack
      }
    };
  }
};
