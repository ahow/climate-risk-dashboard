CREATE TABLE `uploadedFiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`filename` varchar(255) NOT NULL,
	`originalFilename` varchar(255) NOT NULL,
	`fileType` varchar(100) NOT NULL,
	`fileSize` int NOT NULL,
	`s3Key` varchar(512) NOT NULL,
	`s3Url` varchar(1024) NOT NULL,
	`uploadedBy` int,
	`uploadedAt` timestamp NOT NULL DEFAULT (now()),
	`description` text,
	CONSTRAINT `uploadedFiles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `uploadedFiles` ADD CONSTRAINT `uploadedFiles_uploadedBy_users_id_fk` FOREIGN KEY (`uploadedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;