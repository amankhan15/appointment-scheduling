variable "subscription_id" {
  description = "Azure subscription ID used for deployment."
  type        = string
  sensitive   = true
}

variable "location" {
  description = "Azure region for the student-scale deployment."
  type        = string
  default     = "centralindia"
}

variable "project_name" {
  description = "Lowercase project name used in resource names."
  type        = string
  default     = "appointments"
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "dev"
}

variable "sql_admin_login" {
  description = "Azure SQL administrator login."
  type        = string
  sensitive   = true
}

variable "sql_admin_password" {
  description = "Azure SQL administrator password. Provide through a secret tfvars file or environment variable."
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "JWT signing secret for the deployed application."
  type        = string
  sensitive   = true
}

variable "container_image" {
  description = "Container image URI deployed to App Service."
  type        = string
  default     = ""
}
