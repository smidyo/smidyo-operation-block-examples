const { evaluate } = require('mathjs');

// @ts-check

exports.handler = async ({ payload }) => {
  let [formula] = payload.formula;

  const scope = {
    a: (payload['variable-a'] || [undefined])[0],
    b: (payload['variable-b'] || [undefined])[0],
    c: (payload['variable-c'] || [undefined])[0],
    d: (payload['variable-d'] || [undefined])[0],
    e: (payload['variable-e'] || [undefined])[0]
  };

  const res = evaluate(formula, scope);

  return {
    type: 'OPERATION_BLOCK_RESULT_OUTCOME',
    result: { result: [res] }
  };
};