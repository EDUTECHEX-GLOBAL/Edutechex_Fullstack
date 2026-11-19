// Keep the uploaded HTML papers in this source folder. CRA's file-loader emits
// them as static assets so they can be used as iframe documents at runtime.
/* eslint import/no-webpack-loader-syntax: off */
import paper11 from "!!file-loader?name=static/media/[name].[hash].[ext]!./EduTechEx_Full_SAT_Mock_11.html";
import paper12 from "!!file-loader?name=static/media/[name].[hash].[ext]!./EduTechEx_Full_SAT_Mock_12.html";
import paper13 from "!!file-loader?name=static/media/[name].[hash].[ext]!./EduTechEx_Full_SAT_Mock_13.html";
import paper14 from "!!file-loader?name=static/media/[name].[hash].[ext]!./EduTechEx_Full_SAT_Mock_14.html";
import paper15 from "!!file-loader?name=static/media/[name].[hash].[ext]!./EduTechEx_Full_SAT_Mock_15.html";
import paper16 from "!!file-loader?name=static/media/[name].[hash].[ext]!./EduTechEx_Full_SAT_Mock_16.html";
import paper17 from "!!file-loader?name=static/media/[name].[hash].[ext]!./EduTechEx_Full_SAT_Mock_17.html";
import paper18 from "!!file-loader?name=static/media/[name].[hash].[ext]!./EduTechEx_Full_SAT_Mock_18.html";
import paper19 from "!!file-loader?name=static/media/[name].[hash].[ext]!./EduTechEx_Full_SAT_Mock_19.html";
import paper20 from "!!file-loader?name=static/media/[name].[hash].[ext]!./EduTechEx_Full_SAT_Mock_20.html";

export const uploadedSatPapers = {
  11: paper11,
  12: paper12,
  13: paper13,
  14: paper14,
  15: paper15,
  16: paper16,
  17: paper17,
  18: paper18,
  19: paper19,
  20: paper20,
};
