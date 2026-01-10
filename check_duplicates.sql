SELECT assetId, COUNT(*) as count
FROM geographicRisks
GROUP BY assetId
HAVING COUNT(*) > 1
ORDER BY count DESC
LIMIT 10;
