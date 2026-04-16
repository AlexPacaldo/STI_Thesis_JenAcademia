-- Add time range columns to teacher_availability table

ALTER TABLE `teacher_availability` 
ADD COLUMN `start_time` TIME NULL AFTER `status`,
ADD COLUMN `end_time` TIME NULL AFTER `start_time`,
ADD COLUMN `break_start` TIME NULL AFTER `end_time`,
ADD COLUMN `break_end` TIME NULL AFTER `break_start`;

-- Add index for query performance
ALTER TABLE `teacher_availability` 
ADD INDEX `idx_teacher_date_time` (`teacher_id`, `available_date`, `start_time`);
