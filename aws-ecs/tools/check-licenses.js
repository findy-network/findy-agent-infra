const jsgl = require("js-green-licenses");
const { mkdirSync, existsSync, writeFileSync, copyFileSync } = require("fs");

// TODO: move to own module
const runCheck = async (path, verbose) => {
    const checker = new jsgl.LicenseChecker({ verbose });
    if (verbose) {
        checker.setDefaultHandlers();
    }
    const licenses = [];
    checker.on("non-green-license", (arg) => {
        licenses.push(arg);
    });
    checker.on("package.json", (arg) => {
        console.log(`Scanning ${arg}`);
    });
    checker.on("error", (err) => {
        throw err;
    });
    await checker.checkLocalDirectory(path);
    return licenses;
};

const scan = async (packageJsonPath, reportPath) => {
    const path = ".temp";

    if (!existsSync(path)) {
        mkdirSync(path);
    }

    copyFileSync(packageJsonPath, `${path}/package.json`);

    // Report mode - list all licenses in report file
    if (reportPath) {
        writeFileSync(
            `${path}/js-green-licenses.json`,
            JSON.stringify({ greenLicenses: [] })
        );

        try {
            const licenses = await runCheck(path);
            writeFileSync(
                reportPath,
                licenses.reduce(
                    (result, { packageName, version, licenseName }) =>
                        `${result}\n${packageName}@${version} ${licenseName}`,
                    ""
                )
            );
            console.log(`Licenses listed to ${reportPath}`);
        } catch (err) {
            console.log(err);
            process.exit(1);
        }
    }

    copyFileSync(
        `./tools/js-green-licenses.json`,
        `${path}/js-green-licenses.json`
    );
    try {
        const licenses = await runCheck(path, true);
        if (licenses.length > 0) {
            licenses.map(({ packageName, version, licenseName }) =>
                console.log(
                    `Found invalid license for ${packageName}@${version}: ${licenseName}`
                )
            );
            console.log("Check license terms for invalid licenses! Either");
            console.log("1) remove incompatible package");
            console.log("2) add license to greenLicenses");
            console.log("3) add package to exception list (packageAllowList)");
            process.exit(1);
        }
    } catch (err) {
        console.log(err);
        process.exit(1);
    }
};

(async () => {
    if (process.argv[2] === "report") {
        await scan(
            "./package.json",
            process.argv[2] === "report" && "./build/licenses.txt"
        );
    } else {
        await scan("./package.json");
    }
})();