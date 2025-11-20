// Test the exact division logic used in the mutation
const testValues = [
  '564765625',
  '7369565.217391304',
  '100000000',
  '1234.56'
];

console.log('Testing value division logic:');
testValues.forEach((valueStr, i) => {
  const value = parseFloat(valueStr);
  const corrected = value / 1000;
  const stored = corrected.toString();
  
  console.log(`\n${i+1}. Original: ${valueStr}`);
  console.log(`   Parsed: ${value}`);
  console.log(`   Divided: ${corrected}`);
  console.log(`   toString(): ${stored}`);
  console.log(`   Ratio: ${(parseFloat(stored) / value).toFixed(6)}`);
});
