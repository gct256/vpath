import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';

type StatsInterface = {
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
};

const WIN_ROOT_PATTERN = /^[a-z]:\\?$/i;

const ROOT_STATS: StatsInterface = {
  isFile: () => false,
  isDirectory: () => true,
  isSymbolicLink: () => false,
};

enum VpathType {
  NORMAL,
  WIN32_ROOT,
  OTHER_ROOT,
}

/** 仮想パスクラス */
export class Vpath {
  /** 絶対パス */
  public readonly filePath: string;

  /** ファイル名 */
  public readonly basename: string;

  /** 拡張子名（ピリオド含む） */
  public readonly extname: string;

  /** 最上位かどうか */
  public readonly isRoot: boolean;

  /** ファイルかどうか */
  public readonly isFile: boolean;

  /** ディレクトリかどうか */
  public readonly isDirectory: boolean;

  /** シンボリックリンクかどうか */
  public readonly isSymbolicLink: boolean;

  /** ファイル・ディレクトリ・シンボリックリンク以外かどうか */
  public readonly isOtherFileType: boolean;

  /* 種別 */
  private readonly vpathType: VpathType;

  /**
   * コンストラクタ / 使わないこと
   *
   * @param filePath ファイルパス
   * @param vpathType 種別
   * @param stats fs.statの結果
   */
  private constructor(
    filePath: string,
    vpathType: VpathType,
    stats: StatsInterface,
  ) {
    this.filePath = path.normalize(filePath);
    this.basename = path.basename(this.filePath);
    this.extname = path.extname(this.filePath);
    this.isRoot = vpathType !== VpathType.NORMAL;
    this.isFile = stats.isFile();
    this.isDirectory = stats.isDirectory();
    this.isSymbolicLink = stats.isSymbolicLink();
    this.isOtherFileType =
      !this.isFile && !this.isDirectory && !this.isSymbolicLink;
    this.vpathType = vpathType;
  }

  /**
   * 仮想パスオブジェクトを生成
   *
   * @param filePath ファイルパス
   */
  public static async create(filePath: string): Promise<Vpath> {
    return Vpath.createVpath(filePath, VpathType.NORMAL);
  }

  private static async createVpath(
    filePath: string,
    vpathType: VpathType,
  ): Promise<Vpath> {
    return new Vpath(filePath, vpathType, await promisify(fs.stat)(filePath));
  }

  /**
   * 最上位の仮想パスオブジェクトを生成
   */
  public static async getRoot(): Promise<Vpath> {
    switch (process.platform) {
      case 'win32':
        return new Vpath('', VpathType.WIN32_ROOT, ROOT_STATS);

      default:
        return Vpath.createVpath('/', VpathType.OTHER_ROOT);
    }
  }

  /**
   * ホームディレクトリの仮想パスオブジェクトを生成
   */
  public static async getHome(): Promise<Vpath> {
    return Vpath.createVpath(os.homedir(), VpathType.NORMAL);
  }

  public toString(): string {
    return `[Vpath ${this.filePath}]`;
  }

  /**
   * 親の仮想パスオブジェクトを生成
   * ただし最上位の場合は自身を返す
   */
  public async getParent(): Promise<Vpath> {
    if (this.isRoot) return this;

    switch (process.platform) {
      case 'win32':
        if (WIN_ROOT_PATTERN.test(this.filePath)) return Vpath.getRoot();
        break;

      default:
        if (path.dirname(this.filePath) === '/') return Vpath.getRoot();
        break;
    }

    return Vpath.create(path.dirname(this.filePath));
  }

  /**
   * 子の仮想パスオブジェクトの配列を生成
   */
  public async getChildren(): Promise<Vpath[]> {
    switch (this.vpathType) {
      case VpathType.WIN32_ROOT:
        return this.getChildrenOfWin32Root();

      default: {
        const children = await promisify(fs.readdir)(this.filePath);

        return Promise.all(
          children.map((child) =>
            Vpath.create(path.resolve(this.filePath, child)),
          ),
        );
      }
    }
  }

  // eslint-disable-next-line class-methods-use-this
  private async getChildrenOfWin32Root(): Promise<Vpath[]> {
    const result = await promisify(exec)('wmic logicaldisk get caption');
    const drives: string[] = result.stdout
      .split(/\r\n|\n|\r/)
      .map((x: string): string => x.replace(/:/g, '').toUpperCase())
      .filter((x: string): boolean => x.length === 1);

    drives.sort();

    return Promise.all(drives.map((x: string) => Vpath.create(`${x}:`)));
  }

  /**
   * 上位をたどる仮想パスオブジェクトの配列を生成
   */
  public async getRoute(): Promise<Vpath[]> {
    if (this.isRoot) return [this];

    return [...(await (await this.getParent()).getRoute()), this];
  }
}
