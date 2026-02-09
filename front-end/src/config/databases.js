export const DB_TYPES = [
  { value: 'mysql', label: 'MySQL', defaultPort: 3306, supportsConnectionString: true, icon: '/logo-mysql.svg' },
  { value: 'postgresql', label: 'PostgreSQL', defaultPort: 5432, supportsConnectionString: true, icon: '/logo-postgresql.svg' },
  { value: 'sqlserver', label: 'SQL Server', defaultPort: 1433, supportsConnectionString: true, icon: '/logo-microsoft-sql-server.svg' },
  { value: 'oracle', label: 'Oracle', defaultPort: 1521, supportsConnectionString: true, icon: '/logo-oracle.svg' },
  { value: 'sqlite', label: 'SQLite', defaultPort: null, supportsConnectionString: false, icon: '/logo-sqlite.svg' },
];
