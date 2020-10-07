exports.handler = async ({ payload }) => {
  const widths = payload['widths'];
  const heights = payload['heights'];
  const [width] = payload['width'];
  const [height] = payload['height'];
  const margin = payload['margin'];

  const sheets = [];
  for (let index = 0; index < widths.length && index < heights.length; index++) {
    sheets.push([widths[index] - margin, heights[index] - margin, index]);
  }
  sheets.sort(([w1, h1], [w2, h2]) => w1 * h1 - w2 * h2);

  const found = sheets.find(([w, h]) => w >= width && h >= height);

  return {
    type: 'OPERATION_BLOCK_RESULT_OUTCOME',
    result: {
      'smallest-sheet-index': found ? [found[2]] : [null]
    }
  };
};
