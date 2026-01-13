CREATE TABLE `progressTracking` (
	`id` int AUTO_INCREMENT NOT NULL,
	`operationId` varchar(255) NOT NULL,
	`operation` varchar(255) NOT NULL,
	`status` enum('running','completed','failed','cancelled','paused') NOT NULL,
	`current` int NOT NULL DEFAULT 0,
	`total` int NOT NULL,
	`message` text,
	`error` text,
	`startedAt` timestamp NOT NULL,
	`completedAt` timestamp,
	`lastUpdatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `progressTracking_id` PRIMARY KEY(`id`),
	CONSTRAINT `progressTracking_operationId_unique` UNIQUE(`operationId`)
);
