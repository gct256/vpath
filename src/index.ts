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

/** Virtual path class for node.js */
export class Vpath {
  /** Absolute path. */
  public readonly filePath: string;

  /** File name. */
  public readonly basename: string;

  /** Extension name. (include dot) */
  public readonly extname: string;

  /** Root directory flag. */
  public readonly isRoot: boolean;

  /** Regular file flag. */
  public readonly isFile: boolean;

  /** Directory flag. */
  public readonly isDirectory: boolean;

  /** Symbolic link flag. */
  public readonly isSymbolicLink: boolean;

  /** Other file type flag. */
  public readonly isOtherFileType: boolean;

  /* Internal path type. */
  private readonly vpathType: VpathType;

  /**
   * private constructor
   *
   * @param filePath file path.
   * @param vpathType internal path type.
   * @param stats result of fs.stat or object.
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
   * Create Vpath object.
   *
   * @param filePath file path.
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
   * Create Vpath object of root directory.
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
   * Create Vpath object of user's home directory.
   */
  public static async getHome(): Promise<Vpath> {
    return Vpath.createVpath(os.homedir(), VpathType.NORMAL);
  }

  public toString(): string {
    return `[Vpath ${this.filePath}]`;
  }

  /**
   * Create Vpath object of parent directory.
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
   * Create array of Vpath object of children.
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
   * Create array of Vpath object of route to root.
   */
  public async getRoute(): Promise<Vpath[]> {
    if (this.isRoot) return [this];

    return [...(await (await this.getParent()).getRoute()), this];
  }
}
