CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text,
	`owner_email` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`metadata_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_events_workspace_idx` ON `audit_events` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `claims` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`claim_text` text NOT NULL,
	`claim_type` text NOT NULL,
	`location_json` text NOT NULL,
	`importance` text NOT NULL,
	`evidence_status` text NOT NULL,
	`supporting_sources_json` text NOT NULL,
	`contradicting_sources_json` text NOT NULL,
	`source_quality` text NOT NULL,
	`confidence` text NOT NULL,
	`issue` text NOT NULL,
	`required_fix` text NOT NULL,
	`fix_category` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `claims_review_idx` ON `claims` (`review_id`);--> statement-breakpoint
CREATE TABLE `corrections` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`review_id` text,
	`owner_email` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`field` text NOT NULL,
	`previous_value` text,
	`corrected_value` text NOT NULL,
	`reason` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `corrections_workspace_idx` ON `corrections` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`owner_email` text NOT NULL,
	`category` text NOT NULL,
	`source_type` text NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`r2_key` text NOT NULL,
	`openai_file_id` text,
	`processing_status` text DEFAULT 'ready' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `documents_workspace_idx` ON `documents` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `facts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`fact_key` text NOT NULL,
	`extracted_value` text,
	`confirmed_value` text,
	`source_ref` text,
	`confidence` text DEFAULT 'low' NOT NULL,
	`confirmed_by` text,
	`confirmed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `facts_workspace_key_unique` ON `facts` (`workspace_id`,`fact_key`);--> statement-breakpoint
CREATE TABLE `findings` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`module` text NOT NULL,
	`title` text NOT NULL,
	`finding` text NOT NULL,
	`severity` text NOT NULL,
	`confidence` text NOT NULL,
	`evidence_json` text NOT NULL,
	`fix_category` text NOT NULL,
	`required_fix` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `findings_review_idx` ON `findings` (`review_id`);--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`owner_email` text NOT NULL,
	`version` integer NOT NULL,
	`status` text NOT NULL,
	`stage` text NOT NULL,
	`review_type` text DEFAULT 'full' NOT NULL,
	`eligibility_result` text,
	`final_verdict` text,
	`recommendation` text,
	`confidence` text,
	`score` integer,
	`result_json` text,
	`model` text NOT NULL,
	`configuration_json` text NOT NULL,
	`source_snapshot_json` text,
	`error_message` text,
	`created_at` text NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reviews_workspace_version_unique` ON `reviews` (`workspace_id`,`version`);--> statement-breakpoint
CREATE INDEX `reviews_workspace_created_idx` ON `reviews` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`title` text NOT NULL,
	`publisher` text NOT NULL,
	`publication_date` text,
	`accessed_date` text NOT NULL,
	`source_type` text NOT NULL,
	`url` text,
	`document_id` text,
	`reliability_tier` integer NOT NULL,
	`notes` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sources_review_idx` ON `sources` (`review_id`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`organization` text NOT NULL,
	`funder` text NOT NULL,
	`opportunity` text NOT NULL,
	`deadline` text,
	`requested_amount` text,
	`geography` text,
	`program_area` text,
	`organization_type` text,
	`proposal_version` text DEFAULT '1' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `workspaces_owner_updated_idx` ON `workspaces` (`owner_email`,`updated_at`);