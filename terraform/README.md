# Azure Infrastructure

This Terraform configuration is a student-scale Azure baseline for the appointment API.

Resources:

- Resource group
- Basic Azure Container Registry
- Basic Azure SQL Database
- Linux App Service plan and Web App for Containers
- Key Vault with JWT and database secrets
- Application Insights
- Log Analytics workspace

## Validate locally

From this directory:

```powershell
Copy-Item terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with real values. Do not commit it.
terraform init
terraform fmt -check
terraform validate
terraform plan -var-file=terraform.tfvars
```

Do not run `terraform apply` until the resource names, region, student-credit budget, and container image strategy have been reviewed. Terraform state and tfvars may contain sensitive values and must remain local or use a secured remote backend.

The current App Service configuration uses the database connection string and JWT secret as App Service settings for a simple first deployment, while also storing them in Key Vault. A later hardening step can replace these settings with Key Vault references after managed identity access is verified.
