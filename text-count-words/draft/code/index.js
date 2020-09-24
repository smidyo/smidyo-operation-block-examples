exports.handler = async ({ payload }) => {
  const [text] = payload["text"];

  const words = text.trim().split(/\s+/).filter(isNaN).length;

  return {
    type: "OPERATION_BLOCK_RESULT_OUTCOME",
    result: {
      words: [words],
    },
  };
};
