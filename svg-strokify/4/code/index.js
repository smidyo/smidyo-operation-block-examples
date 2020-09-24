const fetch = require('node-fetch');
const { Builder, Parser } = require('xml2js');
const AWS = require('aws-sdk');
const LambdaService = new AWS.Lambda();

exports.handler = async ({
  payload,
  tempPayloadletFilesDomain,
  getTempPayloadletFileUploadURLsFunctionARN
}) => {
  const svgs = payload['svg'];
  const [strokeWidth] = payload['stroke-width'] || ['1px'];
  const [addNonScalingStroke] = payload['add-non-scaling-stroke-effect'] || [false];
  const [forceColor] = payload['force-color'] || [];

  try {
    const strokeOnlySVGs = await Promise.all(
      svgs.map(async svg => {
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

        if (svgObject['svg']['defs']) {
          // delete defs
          delete svgObject['svg']['defs'];
        }

        const iterate = (node, parent) => {
          Object.entries(node).forEach(([key, value]) => {
            if (typeof value === 'object' && key !== '$') {
              return iterate(value, Array.isArray(value) ? key : parent);
            } else if (parent === 'path') {
              if (forceColor) {
                value.stroke = forceColor;
              } else if (!value.stroke) {
                // no stroke?
                if (value.fill) {
                  // use the fill color if that's avaiable
                  value.stroke = value.fill;
                } else {
                  // otherwise just do black
                  value.stroke = 'black';
                }
              }

              if (addNonScalingStroke) {
                value['vector-effect'] = 'non-scaling-stroke';
              }
              value.fill = 'none';
              value['stroke-width'] = strokeWidth;
            }
          });
          return node;
        };

        // make sure ns is set
        // some converters leave it out...
        svgObject.svg.$.xmlns = 'http://www.w3.org/2000/svg';

        iterate(svgObject['svg'], 'svg');

        const builder = new Builder();

        const strokeOnlySVG = builder.buildObject(svgObject);

        const uploadURLRes = await LambdaService.invoke({
          FunctionName: getTempPayloadletFileUploadURLsFunctionARN,
          Payload: JSON.stringify({ forFiles: [{ extension: 'svg' }] })
        }).promise();

        const [uploadInfo] = JSON.parse(uploadURLRes.Payload);

        await fetch(uploadInfo.uploadURL, { method: 'PUT', body: strokeOnlySVG });

        return {
          svg: uploadInfo.fileKey,
          originalFilename: svg.originalFilename,
          unit: svg.unit
        };
      })
    );

    return {
      type: 'OPERATION_BLOCK_RESULT_OUTCOME',
      result: { 'stroke-only-svg': strokeOnlySVGs }
    };
  } catch (err) {
    console.log(err);
    return {
      type: 'REJECTION_OUTCOME',
      rejection: "Could not strokify SVG's",
      error: {
        message: err.message,
        stack: err.stack
      }
    };
  }
};
