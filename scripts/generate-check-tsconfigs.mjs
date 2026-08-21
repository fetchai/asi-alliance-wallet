/* eslint-disable import/no-extraneous-dependencies, @typescript-eslint/no-var-requires */

import "zx/globals";
import fs from "fs";
import path from "path";

function getWorkspacePackages() {
  const rootDir = path.resolve(__dirname, "..");
  const result = [];

  for (const parent of ["packages", "apps"]) {
    const parentDir = path.join(rootDir, parent);
    if (!fs.existsSync(parentDir)) continue;

    for (const dir of fs.readdirSync(parentDir)) {
      const pkgDir = path.join(parentDir, dir);
      const stat = fs.statSync(pkgDir);
      if (!stat.isDirectory()) continue;

      const pkgJsonPath = path.join(pkgDir, "package.json");
      const tsconfigPath = path.join(pkgDir, "tsconfig.json");
      const srcDir = path.join(pkgDir, "src");

      // tsconfig.json과 src/ 둘 다 있는 패키지만 대상
      if (
        !fs.existsSync(pkgJsonPath) ||
        !fs.existsSync(tsconfigPath) ||
        !fs.existsSync(srcDir)
      ) {
        continue;
      }

      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
      if (!pkgJson.name || !pkgJson.name.startsWith("@keplr-wallet/")) {
        continue;
      }

      result.push({
        name: pkgJson.name,
        dir: pkgDir,
      });
    }
  }

  return result;
}

(async () => {
  const packages = getWorkspacePackages();

  const generatedFiles = [];

  for (const pkg of packages) {
    const paths = {};

    for (const other of packages) {
      // 현재 패키지에서 대상 패키지의 src/로의 상대 경로
      const relativeSrc = path
        .relative(pkg.dir, path.join(other.dir, "src"))
        .split(path.sep)
        .join("/");

      // @keplr-wallet/xxx -> xxx/src (self-reference 포함)
      paths[other.name] = [relativeSrc];
      // @keplr-wallet/xxx/build/* -> xxx/src/* (deep import 지원)
      paths[`${other.name}/build/*`] = [`${relativeSrc}/*`];
    }

    // rootDir를 모노레포 루트로 설정하여 다른 패키지 소스 참조 시 TS6059 방지
    const rootDir = path
      .relative(pkg.dir, path.resolve(__dirname, ".."))
      .split(path.sep)
      .join("/");

    // tsconfig.check.json은 빌드 없이 빠른 타입체크만을 위한 설정이므로
    // skipLibCheck를 켜서 node_modules 내 .d.ts 검사를 생략하고 속도를 높인다.
    const tsconfig = {
      extends: "./tsconfig.json",
      compilerOptions: {
        baseUrl: ".",
        rootDir,
        noEmit: true,
        skipLibCheck: true,
        paths,
      },
      // 다른 패키지의 ambient .d.ts 선언을 포함 (globalThis 확장 등)
      include: ["src/**/*", "../../packages/*/src/**/*.d.ts"],
    };

    const outPath = path.join(pkg.dir, "tsconfig.check.json");
    fs.writeFileSync(outPath, JSON.stringify(tsconfig, null, 2) + "\n");
    generatedFiles.push(outPath);
    console.log(
      `Generated: ${path.relative(path.resolve(__dirname, ".."), outPath)}`
    );

    // 패키지별 .eslintrc.json에 자기 자신의 패키지명 import 금지 규칙 추가.
    // 기존 .eslintrc.json이 있으면 rules를 병합하고, 없으면 새로 생성한다.
    // 하위 eslintrc는 같은 rule에 대해 부모를 완전히 대체하므로
    // root의 "src/*" 패턴도 함께 포함해야 한다.
    const eslintrcPath = path.join(pkg.dir, ".eslintrc.json");
    const existingEslintrc = fs.existsSync(eslintrcPath)
      ? JSON.parse(fs.readFileSync(eslintrcPath, "utf8"))
      : {};
    existingEslintrc.rules = {
      ...existingEslintrc.rules,
      "no-restricted-imports": [
        "error",
        { patterns: ["src/*", pkg.name, `${pkg.name}/*`] },
      ],
    };
    fs.writeFileSync(
      eslintrcPath,
      JSON.stringify(existingEslintrc, null, 2) + "\n"
    );
    generatedFiles.push(eslintrcPath);
    console.log(
      `Generated: ${path.relative(path.resolve(__dirname, ".."), eslintrcPath)}`
    );
  }

  // 생성된 파일들에 prettier 적용
  await $`npx prettier --write ${generatedFiles}`;

  console.log(
    `\nDone! Generated ${packages.length} tsconfig.check.json + .eslintrc.json files.`
  );
})();

/* eslint-enable import/no-extraneous-dependencies, @typescript-eslint/no-var-requires */
