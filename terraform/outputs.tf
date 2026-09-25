output "resource_group_name" {
  value = azurerm_resource_group.app.name
}

output "app_service_name" {
  value = azurerm_linux_web_app.app.name
}

output "app_service_url" {
  value = "https://${azurerm_linux_web_app.app.default_hostname}"
}

output "container_registry_login_server" {
  value = azurerm_container_registry.app.login_server
}

output "sql_server_fqdn" {
  value = azurerm_mssql_server.sql.fully_qualified_domain_name
}

output "key_vault_name" {
  value = azurerm_key_vault.app.name
}
