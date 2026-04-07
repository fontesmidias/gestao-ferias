require('dotenv/config')

module.exports = {
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env["DATABASE_URL"] || "postgresql://dummy:dummy@localhost:5432/dummy",
  },
}
