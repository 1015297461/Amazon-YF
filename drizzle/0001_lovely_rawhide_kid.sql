CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int NOT NULL,
	`userId` int NOT NULL,
	`asin` varchar(20) NOT NULL,
	`marketplace` varchar(32) NOT NULL,
	`title` text,
	`brand` varchar(500),
	`price` varchar(100),
	`rating` varchar(20),
	`reviewCount` varchar(50),
	`availability` text,
	`bulletPoints` json,
	`description` text,
	`mainImage` text,
	`images` json,
	`specifications` json,
	`productDetails` json,
	`categories` text,
	`seller` varchar(500),
	`productStatus` enum('success','failed') NOT NULL DEFAULT 'success',
	`errorMessage` text,
	`scrapedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scrape_tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`marketplace` varchar(32) NOT NULL,
	`totalAsins` int NOT NULL,
	`completedAsins` int NOT NULL DEFAULT 0,
	`failedAsins` int NOT NULL DEFAULT 0,
	`status` enum('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scrape_tasks_id` PRIMARY KEY(`id`)
);
