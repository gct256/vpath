import typescript2 from 'rollup-plugin-typescript2';
import autoExternal from 'rollup-plugin-auto-external';

// リリースビルド切り替え
const isProduction = process.env.NODE_ENV === 'production';

// 共通設定
const base = {
  input: './src/index.ts',
  plugins: [
    autoExternal(),
    typescript2({
      tsconfigOverride: {
        compilerOptions: {
          declaration: isProduction,
          declarationDir: './types',
        },
        include: ['./src/index.ts', './src/missing.d.ts'],
        exclude: ['./node_modules/**/*.*'],
      },
      useTsconfigDeclarationDir: true,
    }),
  ],
};

// CommonJS向けビルド
const targets = [
  {
    ...base,
    output: {
      file: './index.js',
      format: 'cjs',
    },
  },
];

if (isProduction) {
  // ES Modules向けビルド（リリース時のみ）
  targets.push({
    ...base,
    output: {
      file: './index.mjs',
      format: 'es',
    },
  });
}

// eslint-disable-next-line import/no-default-export
export default targets;
