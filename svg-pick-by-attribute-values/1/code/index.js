const fetch = require('node-fetch');
const { Builder, Parser } = require('xml2js');
const AWS = require('aws-sdk');
const LambdaService = new AWS.Lambda();

exports.handler = async ({
  payload,
  tempPayloadletFilesDomain,
  getTempPayloadletFileUploadURLsFunctionARN
}) => {
  const [svg] = payload['svg'];
  const values1 = payload['values-1'];
  const values2 = payload['values-2'] || [null];
  const values3 = payload['values-3'] || [null];
  const [attribute] = payload['attribute'];

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

  const svg1Paths = [];
  const svg2Paths = [];
  const svg3Paths = [];

  const iterate = node => {
    Object.entries(node).forEach(([key, value]) => {
      if (typeof value === 'object' && key !== '$') {
        return iterate(value);
      } else {
        if (values1.some(v => v === value[attribute])) {
          svg1Paths.push({ $: value });
        }
        if (values2 && values2.some(v => v === value[attribute])) {
          svg2Paths.push({ $: value });
        }
        if (values3 && values3.some(v => v === value[attribute])) {
          svg3Paths.push({ $: value });
        }
      }
    });
  };

  iterate(svgObject['svg']);

  const buildSVGAndMakePayloadlet = async svgObj => {
    const builder = new Builder();

    const newSVGData = builder.buildObject(svgObj);

    const uploadURLRes = await LambdaService.invoke({
      FunctionName: getTempPayloadletFileUploadURLsFunctionARN,
      Payload: JSON.stringify({ forFiles: [{ extension: 'svg' }] })
    }).promise();

    const [uploadInfo] = JSON.parse(uploadURLRes.Payload);

    await fetch(uploadInfo.uploadURL, { method: 'PUT', body: newSVGData });

    return [{ svg: uploadInfo.fileKey }];
  };

  const [svg1, svg2, svg3] = await Promise.all([
    buildSVGAndMakePayloadlet({
      svg: {
        $: svgObject.svg.$,
        path: svg1Paths
      }
    }),
    svg2Paths.length
      ? buildSVGAndMakePayloadlet({
          svg: {
            $: svgObject.svg.$,
            path: svg2Paths
          }
        })
      : [null],
    svg3Paths.length
      ? buildSVGAndMakePayloadlet({
          svg: {
            $: svgObject.svg.$,
            path: svg3Paths
          }
        })
      : [null]
  ]);

  return {
    type: 'OPERATION_BLOCK_RESULT_OUTCOME',
    result: {
      'svg-1': svg1,
      'svg-2': svg2,
      'svg-3': svg3
    }
  };
};
