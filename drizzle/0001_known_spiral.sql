CREATE TABLE `assets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`assetName` varchar(500) NOT NULL,
	`address` text,
	`latitude` varchar(50),
	`longitude` varchar(50),
	`city` varchar(255),
	`stateProvince` varchar(255),
	`country` varchar(255),
	`assetType` varchar(255),
	`assetSubtype` varchar(255),
	`estimatedValueUsd` varchar(50),
	`ownershipShare` varchar(50),
	`dataSources` text,
	`confidenceLevel` varchar(50),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `assets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `companies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`isin` varchar(12) NOT NULL,
	`name` varchar(255) NOT NULL,
	`sector` varchar(255),
	`geography` varchar(255),
	`tangibleAssets` varchar(50),
	`enterpriseValue` varchar(50),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `companies_id` PRIMARY KEY(`id`),
	CONSTRAINT `companies_isin_unique` UNIQUE(`isin`)
);
--> statement-breakpoint
CREATE TABLE `geographicRisks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`assetId` int NOT NULL,
	`latitude` varchar(50) NOT NULL,
	`longitude` varchar(50) NOT NULL,
	`assetValue` varchar(50) NOT NULL,
	`riskData` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `geographicRisks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `riskManagementScores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`overallScore` int,
	`assessmentData` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `riskManagementScores_id` PRIMARY KEY(`id`)
);
