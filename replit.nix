{ pkgs }: {
    deps = [
        pkgs.bun
        pkgs.nodejs
        pkgs.nodePackages.typescript
        pkgs.yarn
    ];
} 