const oracledb = require("oracledb");

async function testOracle() {
    let connection;

    try {
        connection = await oracledb.getConnection({
            user: "SYSTEM",
            password: "thakkarop",
            connectString: "10.130.65.22:1521/FREEPDB1"
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