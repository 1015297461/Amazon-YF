ALTER TABLE `products` ADD `bsrMainCategory` varchar(500);--> statement-breakpoint
ALTER TABLE `products` ADD `bsrMainRank` int;--> statement-breakpoint
ALTER TABLE `products` ADD `bsrSubCategory` varchar(500);--> statement-breakpoint
ALTER TABLE `products` ADD `bsrSubRank` int;--> statement-breakpoint
ALTER TABLE `products` ADD `bsrRawText` text;--> statement-breakpoint
ALTER TABLE `products` ADD `customersSay` text;--> statement-breakpoint
ALTER TABLE `products` ADD `reviewImages` json;--> statement-breakpoint
ALTER TABLE `products` ADD `selectToLearnMore` json;