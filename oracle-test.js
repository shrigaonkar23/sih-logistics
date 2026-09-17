process.loadEnvFile(".env");

const oracledb = require("oracledb");

async function testOracle() {
    let connection;

    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASSWORD,
            connectString: process.env.ORACLE_CONNECT_STRING
        });

        console.log("Oracle connection successful!");

        const result = await connection.execute(
            "SELECT 'SILP Oracle connection working' AS MESSAGE FROM DUAL"
        );

        console.log(result.rows);

    } catch (err) {
        console.error("Oracle connection failed:");
        console.error(err);

    } finally {
        if (connection) {
            await connection.close();
        }
    }
}

testOracle();