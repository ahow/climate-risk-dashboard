CREATE TABLE `supplyChainRisks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`countryCode` varchar(3) NOT NULL,
	`sectorCode` varchar(20) NOT NULL,
	`expectedAnnualLossPct` varchar(50),
	`expectedAnnualLoss` varchar(50),
	`presentValue` varchar(50),
	`topSuppliers` json,
	`assessmentData` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `supplyChainRisks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `companies` ADD `supplierCosts` varchar(50);