const fetch = require('node-fetch');
const { Parser } = require('xml2js');

exports.handler = async ({ payload, tempPayloadletFilesDomain }) => {
  const svgs = payload['svg'];

  const strokeColors = new Set();
  const strokeWidths = new Set();
  const fillColors = new Set();

  try {
    const svgObjects = await Promise.all(
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

        return svgObject;
      })
    );

    for (const svgObject of svgObjects) {
      const iterate = (node, parent, grandParent) => {
        Object.keys(node).map(key => {
          const currentNode = node[key];
          if (typeof currentNode === 'object' && key !== '$') {
            return iterate(currentNode, key, parent);
          } else {
            if(grandParent === 'path') {
              if (currentNode.stroke) strokeColors.add(currentNode.stroke);
              if (currentNode.fill) fillColors.add(currentNode.fill);
              if (currentNode['stroke-width'])
                strokeWidths.add(currentNode['stroke-width']);
            }
          }
        });
        return node;
      };

      iterate(svgObject['svg']);
    }

    return {
      type: 'OPERATION_BLOCK_RESULT_OUTCOME',
      result: {
        'stroke-colors': Array.from(strokeColors).sort(),
        'stroke-widths': Array.from(strokeWidths).sort(),
        'fill-colors': Array.from(fillColors).sort()
      }
    };
  } catch (err) {
    console.log(err);
    return {
      type: 'REJECTION_OUTCOME',
      rejection: "Could not analyze SVG's",
      error: {
        message: err.message,
        stack: err.stack
      }
    };
  }
};
