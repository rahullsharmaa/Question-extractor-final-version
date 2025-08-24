@@ .. @@
 import React from 'react';
 import { BlockMath, InlineMath } from 'react-katex';
 import 'katex/dist/katex.min.css';
 import { ExtractedQuestion } from '../lib/gemini';
-import { FileText, CheckCircle, Circle, Hash, Edit3, Trash2, ImagePlus, Image } from 'lucide-react';
+import { FileText, CheckCircle, Circle, Hash, Edit3, Trash2, ImagePlus, Image, Clock, Award } from 'lucide-react';

 interface QuestionPreviewProps {
@@ .. @@
       )}

+      {/* Marking Scheme Info */}
+      <div className="mb-4">
+        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
+          <div className="bg-green-50 p-3 rounded-lg border border-green-200">
+            <div className="flex items-center gap-2 mb-1">
+              <Award className="w-4 h-4 text-green-600" />
+              <span className="text-xs font-medium text-green-800">Correct</span>
+            </div>
+            <span className="text-sm font-bold text-green-700">+4 marks</span>
+          </div>
+          
+          <div className="bg-red-50 p-3 rounded-lg border border-red-200">
+            <div className="flex items-center gap-2 mb-1">
+              <Award className="w-4 h-4 text-red-600" />
+              <span className="text-xs font-medium text-red-800">Incorrect</span>
+            </div>
+            <span className="text-sm font-bold text-red-700">-1 marks</span>
+          </div>
+          
+          <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
+            <div className="flex items-center gap-2 mb-1">
+              <Award className="w-4 h-4 text-gray-600" />
+              <span className="text-xs font-medium text-gray-800">Skipped</span>
+            </div>
+            <span className="text-sm font-bold text-gray-700">0 marks</span>
+          </div>
+          
+          <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
+            <div className="flex items-center gap-2 mb-1">
+              <Clock className="w-4 h-4 text-blue-600" />
+              <span className="text-xs font-medium text-blue-800">Time</span>
+            </div>
+            <span className="text-sm font-bold text-blue-700">3 min</span>
+          </div>
+        </div>
+      </div>
+
       {/* Continuation Indicator */}
       {question.is_continuation && (