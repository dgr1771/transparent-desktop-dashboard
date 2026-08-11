/*
 * shape-input.c — 设置 X11 窗口的输入区域（SHAPE 扩展）
 *
 * 用法：shape-input <hwnd> <x1,y1,w1,h1> <x2,y2,w2,h2> ...
 * 效果：只在指定矩形区域内接收鼠标事件，区域外穿透到下层窗口
 *
 * 编译：gcc -o shape-input shape-input.c -lX11 -lXext
 */
#include <X11/Xlib.h>
#include <X11/Xutil.h>
#include <X11/extensions/shape.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

int main(int argc, char *argv[]) {
    if (argc < 3) {
        fprintf(stderr, "用法: shape-input <窗口ID> <x,y,w,h> [<x,y,w,h> ...]\n");
        return 1;
    }

    Display *dpy = XOpenDisplay(NULL);
    if (!dpy) {
        fprintf(stderr, "无法打开 X 显示\n");
        return 2;
    }

    Window win = (Window)atol(argv[1]);
    if (!win) {
        fprintf(stderr, "无效窗口 ID: %s\n", argv[1]);
        XCloseDisplay(dpy);
        return 3;
    }

    /* 构建输入区域矩形 */
    int nrects = argc - 2;
    XRectangle *rects = malloc(nrects * sizeof(XRectangle));
    memset(rects, 0, nrects * sizeof(XRectangle));

    for (int i = 0; i < nrects; i++) {
        int x, y, w, h;
        if (sscanf(argv[2 + i], "%d,%d,%d,%d", &x, &y, &w, &h) != 4) {
            fprintf(stderr, "无效矩形: %s\n", argv[2 + i]);
            free(rects);
            XCloseDisplay(dpy);
            return 4;
        }
        rects[i].x = x;
        rects[i].y = y;
        rects[i].width = w;
        rects[i].height = h;
    }

    /* 设置输入区域（SHAPE 扩展）
     * ShapeInput = 只影响鼠标输入区域，不影响窗口形状
     * 区域外鼠标事件穿透到下层窗口
     */
    XShapeCombineRectangles(dpy, win, ShapeInput, 0, 0, rects, nrects, ShapeSet, YXBanded);
    XFlush(dpy);

    free(rects);
    XCloseDisplay(dpy);

    printf("OK %d 个矩形\n", nrects);
    return 0;
}
