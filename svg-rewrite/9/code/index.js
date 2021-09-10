//@ts-check

const fetch = require('node-fetch');
const { Builder, Parser } = require('xml2js');
//@ts-ignore
const AWS = require('aws-sdk');
const LambdaService = new AWS.Lambda();

const sanitizeColor = color =>
  color ? (color.startsWith('url') ? 'black' : color) : color;

exports.handler = async ({
  payload,
  tempPayloadletFilesDomain,
  getTempPayloadletFileUploadURLsFunctionARN
}) => {
  const svgs = payload['svg'];
  const [stroke] = payload['stroke'];
  const [fill] = payload['fill'];
  const [strokeWidth] = payload['stroke-width'];
  const addNonScalingStroke =
    (payload['add-non-scaling-stroke-effect'] &&
      payload['add-non-scaling-stroke-effect'][0]) ||
    false;
  const preferredColor =
    (payload['preferred-color'] && payload['preferred-color'][0]) || 'black';
  const preferredStrokeWidth =
    (payload['preferred-stroke-width'] && payload['preferred-stroke-width'][0]) || '1px';

  try {
    const rewrittenSVGs = await Promise.all(
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

        if (svgObject['svg']['defs']) {
          // delete defs
          delete svgObject['svg']['defs'];
        }

        const iterate = (node, parent, parentStroke) => {
          Object.entries(node).forEach(([key, value]) => {
            if (typeof value === 'object' && key !== '$') {
              return iterate(
                value,
                Array.isArray(value) ? key : parent,
                parentStroke || (value.$ && value.$.stroke)
              );
            } else if (parent === 'path') {
              if (addNonScalingStroke) value['vector-effect'] = 'non-scaling-stroke';

              switch (strokeWidth) {
                case 'preferred-if-no-fill':
                  if (!value['fill'] || value['fill'] === 'none')
                    value['stroke-width'] = preferredStrokeWidth;
                  break;
                case 'preferred':
                  value['stroke-width'] = preferredStrokeWidth;
                  break;
                case 'none':
                  value['stroke-width'] = 'none';
                  break;
              }

              switch (stroke) {
                case 'original-or-fill-or-preferred':
                  if (!value['stroke'] || value['stroke'] === 'none')
                    if (value['fill'] && value['fill'] !== 'none')
                      value.stroke = sanitizeColor(value.fill);
                    else value.stroke = sanitizeColor(parentStroke) || preferredColor;
                  else value.stroke = sanitizeColor(value.stroke);
                  break;
                case 'fill-or-original-or-preferred':
                  if (value['fill'] && value['fill'] !== 'none')
                    value.stroke = sanitizeColor(value.fill);
                  else if (!value['stroke'] || value['stroke'] === 'none')
                    value.stroke = sanitizeColor(parentStroke) || preferredColor;
                case 'preferred':
                  value.stroke = sanitizeColor(preferredColor);
                  break;
                case 'none':
                  value.stroke = 'none';
                  break;
              }

              switch (fill) {
                case 'original-or-stroke-or-preferred':
                  if (!value['fill'] || value['fill'] === 'none')
                    if (value['stroke'] && value['stroke'] !== 'none')
                      value.fill = sanitizeColor(value.stroke);
                    else value.fill = sanitizeColor(preferredColor);
                  else value.fill = sanitizeColor(value.fill);
                  break;
                case 'preferred':
                  value.fill = sanitizeColor(preferredColor);
                  break;
                case 'none':
                  value.fill = 'none';
                  break;
              }
              if (!value.fill) value.fill = 'none';
            }
          });
          return node;
        };

        // make sure ns is set
        // some converters original it out...
        svgObject.svg.$.xmlns = 'http://www.w3.org/2000/svg';

        iterate(svgObject['svg'], 'svg');

        const builder = new Builder();

        const strokeOnlySVG = builder.buildObject(svgObject);

        const uploadURLRes = await LambdaService.invoke({
          FunctionName: getTempPayloadletFileUploadURLsFunctionARN,
          Payload: JSON.stringify({ forFiles: [{ extension: 'svg' }] })
        }).promise();

        const [uploadInfo] = JSON.parse(uploadURLRes.Payload);

        //@ts-ignore
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
      result: { 'rewritten-svg': rewrittenSVGs }
    };
  } catch (err) {
    return {
      type: 'REJECTION_OUTCOME',
      rejection: "Could not rewrite SVG's",
      error: {
        message: err.message,
        stack: err.stack
      }
    };
  }
};
