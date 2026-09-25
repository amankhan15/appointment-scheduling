locals {
  name_prefix  = "${var.project_name}-${var.environment}"
  sql_host     = "${azurerm_mssql_server.sql.name}.database.windows.net"
  database_url = "mssql+pyodbc://${var.sql_admin_login}:${var.sql_admin_password}@${local.sql_host}/${azurerm_mssql_database.app.name}?driver=ODBC+Driver+18+for+SQL+Server&Encrypt=yes&TrustServerCertificate=no"
}

resource "azurerm_resource_group" "app" {
  name     = "rg-${local.name_prefix}"
  location = var.location
}

resource "azurerm_log_analytics_workspace" "app" {
  name                = "log-${local.name_prefix}"
  location            = azurerm_resource_group.app.location
  resource_group_name = azurerm_resource_group.app.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
}

resource "azurerm_application_insights" "app" {
  name                = "appi-${local.name_prefix}"
  location            = azurerm_resource_group.app.location
  resource_group_name = azurerm_resource_group.app.name
  workspace_id        = azurerm_log_analytics_workspace.app.id
  application_type    = "web"
}

resource "azurerm_container_registry" "app" {
  name                = replace("acr${local.name_prefix}", "-", "")
  resource_group_name = azurerm_resource_group.app.name
  location            = azurerm_resource_group.app.location
  sku                 = "Basic"
  admin_enabled       = false
}

resource "azurerm_mssql_server" "sql" {
  name                         = "sql-${local.name_prefix}"
  resource_group_name          = azurerm_resource_group.app.name
  location                     = azurerm_resource_group.app.location
  version                      = "12.0"
  administrator_login          = var.sql_admin_login
  administrator_login_password = var.sql_admin_password
  minimum_tls_version          = "1.2"
}

resource "azurerm_mssql_database" "app" {
  name        = "sqldb-${local.name_prefix}"
  server_id   = azurerm_mssql_server.sql.id
  sku_name    = "Basic"
  max_size_gb = 2
}

resource "azurerm_mssql_firewall_rule" "azure_services" {
  name             = "allow-azure-services"
  server_id        = azurerm_mssql_server.sql.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}

resource "azurerm_key_vault" "app" {
  name                       = "kv-${local.name_prefix}"
  location                   = azurerm_resource_group.app.location
  resource_group_name        = azurerm_resource_group.app.name
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "standard"
  purge_protection_enabled   = false
  soft_delete_retention_days = 7
  rbac_authorization_enabled = true
}

resource "azurerm_key_vault_secret" "jwt" {
  name         = "jwt-secret"
  value        = var.jwt_secret
  key_vault_id = azurerm_key_vault.app.id
}

resource "azurerm_key_vault_secret" "database_url" {
  name         = "database-url"
  value        = local.database_url
  key_vault_id = azurerm_key_vault.app.id
}

resource "azurerm_service_plan" "app" {
  name                = "plan-${local.name_prefix}"
  resource_group_name = azurerm_resource_group.app.name
  location            = azurerm_resource_group.app.location
  os_type             = "Linux"
  sku_name            = "B1"
}

resource "azurerm_linux_web_app" "app" {
  name                = "app-${local.name_prefix}"
  resource_group_name = azurerm_resource_group.app.name
  location            = azurerm_service_plan.app.location
  service_plan_id     = azurerm_service_plan.app.id

  identity {
    type = "SystemAssigned"
  }

  site_config {
    always_on = false

    application_stack {
      docker_image_name   = var.container_image != "" ? var.container_image : "appointment-api:local"
      docker_registry_url = var.container_image != "" ? "https://${azurerm_container_registry.app.login_server}" : null
    }
  }

  app_settings = {
    APP_ENV                               = "production"
    DATABASE_URL                          = local.database_url
    JWT_SECRET                            = var.jwt_secret
    JWT_ALGORITHM                         = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES           = "30"
    APPLICATIONINSIGHTS_CONNECTION_STRING = azurerm_application_insights.app.connection_string
    WEBSITES_PORT                         = "8000"
  }
}

data "azurerm_client_config" "current" {}

resource "azurerm_role_assignment" "app_key_vault_secrets" {
  scope                = azurerm_key_vault.app.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_linux_web_app.app.identity[0].principal_id
}

resource "azurerm_role_assignment" "app_acr_pull" {
  scope                = azurerm_container_registry.app.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_linux_web_app.app.identity[0].principal_id
}
