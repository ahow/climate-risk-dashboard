-- Create uploadedFiles table if it doesn't exist
CREATE TABLE IF NOT EXISTS `uploadedFiles` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `filename` varchar(255) NOT NULL,
  `originalFilename` varchar(255) NOT NULL,
  `fileType` varchar(100) NOT NULL,
  `fileSize` int NOT NULL,
  `s3Key` varchar(512) NOT NULL,
  `s3Url` varchar(1024) NOT NULL,
  `uploadedBy` int,
  `uploadedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `description` text,
  FOREIGN KEY (`uploadedBy`) REFERENCES `users`(`id`)
);

-- Show tables to verify
SHOW TABLES;
