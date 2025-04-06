{ pkgs }: {
    deps = [
        pkgs.bun
        pkgs.nodejs
        pkgs.nodePackages.typescript-language-server
        pkgs.nodePackages.typescript
    ];
} 