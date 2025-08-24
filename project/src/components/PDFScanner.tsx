import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Eye, Database, Zap, BookOpen, Calendar, X, ToggleLeft, ToggleRight, Settings, Clock, Award } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { convertPdfToImages, performExtraction, ExtractedQuestion } from '../lib/gemini';
import { QuestionPreview } from './QuestionPreview';
import toast, { Toaster } from 'react-hot-toast';

interface Course {
  id: string;
  name: string;
}

interface Exam {
  id: string;
}

interface QuestionTypeConfig {
  type: 'MCQ' | 'MSQ' | 'NAT' | 'Subjective';
  enabled: boolean;
  correct_marks: number;
  incorrect_marks: number;
  skipped_marks: number;
  partial_marks: number;
  time_minutes: number;
}

interface PDFUpload {
  file: File | null;
  year: string;
  id: string;
}

interface ScanProgress {
  currentPdf: number;
  totalPdfs: number;
  currentPdfName: string;
  status: string;
}

export function PDFUploader() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExam, setSelectedExam] = useState<string>('');
  const [selectedCourse, setSelectedCourse] = useState<string>('');
  const [slot, setSlot] = useState<string>('');
  const [part, setPart] = useState<string>('');
  const [questionTypeConfigs, setQuestionTypeConfigs] = useState<QuestionTypeConfig[]>([
    { type: 'MCQ', enabled: false, correct_marks: 4, incorrect_marks: -1, skipped_marks: 0, partial_marks: 0, time_minutes: 3 },
    { type: 'MSQ', enabled: false, correct_marks: 4, incorrect_marks: -2, skipped_marks: 0, partial_marks: 1, time_minutes: 3 },
    { type: 'NAT', enabled: false, correct_marks: 4, incorrect_marks: 0, skipped_marks: 0, partial_marks: 0, time_minutes: 3 },
    { type: 'Subjective', enabled: false, correct_marks: 10, incorrect_marks: 0, skipped_marks: 0, partial_marks: 2, time_minutes: 15 }
  ]);
  const [pdfUploads, setPdfUploads] = useState<PDFUpload[]>(() => 
    Array.from({ length: 20 }, (_, i) => ({ file: null, year: '', id: `pdf-${i}` }))
  );
  const [extractedQuestions, setExtractedQuestions] = useState<ExtractedQuestion[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [scanProgress, setScanProgress] = useState<ScanProgress>({
    currentPdf: 0,
    totalPdfs: 0,
    currentPdfName: '',
    status: ''
  });

  // Fetch courses and exams on component mount
  React.useEffect(() => {
    fetchCourses();
    fetchExams();
  }, []);

  const fetchCourses = async () => {
    try {
      const { data, error } = await supabase
        .from('courses')
        .select('id, name')
        .order('name');
      
      if (error) throw error;
      setCourses(data || []);
    } catch (error) {
      console.error('Error fetching courses:', error);
      toast.error('Failed to load courses');
    }
  };

  const fetchExams = async () => {
    try {
      const { data, error } = await supabase
        .from('exams')
        .select('id')
        .order('id');
      
      if (error) throw error;
      setExams(data || []);
    } catch (error) {
      console.error('Error fetching exams:', error);
      toast.error('Failed to load exams');
    }
  };

  const updateQuestionTypeConfig = (type: 'MCQ' | 'MSQ' | 'NAT' | 'Subjective', field: string, value: number | boolean) => {
    setQuestionTypeConfigs(prev => prev.map(config => 
      config.type === type ? { ...config, [field]: value } : config
    ));
  };

  const getEnabledQuestionTypes = () => {
    return questionTypeConfigs.filter(config => config.enabled);
  };

  const createDropzoneHandlers = (index: number) => {
    const onDrop = useCallback((acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        const file = acceptedFiles[0];
        setPdfUploads(prev => prev.map((upload, i) => 
          i === index ? { ...upload, file } : upload
        ));
      }
    }, [index]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
      onDrop,
      accept: {
        'application/pdf': ['.pdf']
      },
      multiple: false
    });

    return { getRootProps, getInputProps, isDragActive };
  };

  const removePdf = (index: number) => {
    setPdfUploads(prev => prev.map((upload, i) => 
      i === index ? { file: null, year: '', id: upload.id } : upload
    ));
  };

  const updateYear = (index: number, year: string) => {
    setPdfUploads(prev => prev.map((upload, i) => 
      i === index ? { ...upload, year } : upload
    ));
  };

  const getValidPdfs = () => {
    return pdfUploads.filter(upload => upload.file && upload.year.trim());
  };

  const scanAndExtractQuestions = async () => {
    const validPdfs = getValidPdfs();
    const enabledTypes = getEnabledQuestionTypes();
    
    if (validPdfs.length === 0 || !selectedExam || !selectedCourse || !slot.trim() || !part.trim() || enabledTypes.length === 0) {
      toast.error('Please fill all required fields: exam, course, slot, part, question types, and upload PDFs');
      return;
    }

    setIsScanning(true);
    setExtractedQuestions([]);
    setScanProgress({
      currentPdf: 0,
      totalPdfs: validPdfs.length,
      currentPdfName: '',
      status: 'Starting...'
    });

    try {
      let allQuestions: ExtractedQuestion[] = [];

      for (let i = 0; i < validPdfs.length; i++) {
        const pdfUpload = validPdfs[i];
        
        setScanProgress({
          currentPdf: i + 1,
          totalPdfs: validPdfs.length,
          currentPdfName: pdfUpload.file!.name,
          status: 'Converting PDF to images...'
        });

        // Convert PDF to images
        const images = await convertPdfToImages(pdfUpload.file!);
        
        setScanProgress(prev => ({
          ...prev,
          status: 'Extracting questions with AI...'
        }));

        // Extract questions using Gemini
        const questions = await performExtraction(images);
        
        // Add year information to questions
        const questionsWithYear = questions.map(q => ({
          ...q,
          year: parseInt(pdfUpload.year)
        }));

        allQuestions = [...allQuestions, ...questionsWithYear];

        // Auto-save if enabled
        if (autoSaveEnabled) {
          setScanProgress(prev => ({
            ...prev,
            status: 'Auto-saving to database...'
          }));
          
          await savePdfQuestions(questionsWithYear, pdfUpload.year);
        }
      }

      setExtractedQuestions(allQuestions);
      
      if (autoSaveEnabled) {
        toast.success(`Successfully processed ${validPdfs.length} PDFs and auto-saved ${allQuestions.length} questions!`);
      } else {
        toast.success(`Successfully extracted ${allQuestions.length} questions from ${validPdfs.length} PDFs!`);
      }

    } catch (error) {
      console.error('Error during scanning:', error);
      toast.error('Failed to process PDFs. Please try again.');
    } finally {
      setIsScanning(false);
      setScanProgress({
        currentPdf: 0,
        totalPdfs: 0,
        currentPdfName: '',
        status: ''
      });
    }
  };

  const savePdfQuestions = async (questions: ExtractedQuestion[], year: string) => {
    const enabledTypes = getEnabledQuestionTypes();
    
    const questionsToInsert = questions.map(q => ({
      question_type: q.question_type,
      question_statement: q.question_statement,
      options: q.options && q.options.length > 0 ? q.options : null,
      course_id: selectedCourse,
      year: parseInt(year),
      slot: slot.trim(),
      part: part.trim(),
      categorized: false,
      // Add marking scheme based on question type
      correct_marks: enabledTypes.find(config => config.type === q.question_type)?.correct_marks || 0,
      incorrect_marks: enabledTypes.find(config => config.type === q.question_type)?.incorrect_marks || 0,
      skipped_marks: enabledTypes.find(config => config.type === q.question_type)?.skipped_marks || 0,
      partial_marks: enabledTypes.find(config => config.type === q.question_type)?.partial_marks || 0,
      time_minutes: enabledTypes.find(config => config.type === q.question_type)?.time_minutes || 0,
    }));

    const validQuestions = questionsToInsert.filter(q => 
      q.question_statement && q.question_statement.trim().length > 0
    );

    if (validQuestions.length === 0) {
      throw new Error('No valid questions to save');
    }

    const { error } = await supabase
      .from('questions')
      .insert(validQuestions);

    if (error) {
      throw error;
    }
  };

  const saveAllToDatabase = async () => {
    if (extractedQuestions.length === 0) {
      toast.error('No questions to save');
      return;
    }

    setIsSaving(true);
    
    try {
      // Group questions by year
      const questionsByYear = extractedQuestions.reduce((acc, question) => {
        const year = question.year?.toString() || 'unknown';
        if (!acc[year]) {
          acc[year] = [];
        }
        acc[year].push(question);
        return acc;
      }, {} as Record<string, ExtractedQuestion[]>);

      // Save each year's questions
      for (const [year, questions] of Object.entries(questionsByYear)) {
        await savePdfQuestions(questions, year);
      }

      toast.success(`Successfully saved ${extractedQuestions.length} questions to database!`);
      
      // Reset form
      setExtractedQuestions([]);
      setPdfUploads(Array.from({ length: 20 }, (_, i) => ({ file: null, year: '', id: `pdf-${i}` })));
      setSelectedExam('');
      setSelectedCourse('');
      setSlot('');
      setPart('');
      setQuestionTypeConfigs(prev => prev.map(config => ({ ...config, enabled: false })));
      
    } catch (error) {
      console.error('Error saving questions:', error);
      toast.error('Failed to save questions to database');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto">
        <Toaster position="top-right" />
        
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="p-3 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl">
              <Upload className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
              Multi-PDF Question Extractor
            </h1>
          </div>
          <p className="text-gray-600 text-lg max-w-2xl mx-auto">
            Upload multiple PDF files, extract questions using AI, and save them to your database with advanced configuration options.
          </p>
        </div>

        {/* Auto-save Toggle */}
        <div className="flex justify-center mb-8">
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center gap-4">
              <span className="text-gray-700 font-medium">Auto-save to Database:</span>
              <button
                onClick={() => setAutoSaveEnabled(!autoSaveEnabled)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all ${
                  autoSaveEnabled 
                    ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {autoSaveEnabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                {autoSaveEnabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>
          </div>
        </div>

        {/* Selection Form */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {/* Exam Selection */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                <Calendar className="w-4 h-4" />
                Select Exam
              </label>
              <select
                value={selectedExam}
                onChange={(e) => setSelectedExam(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
              >
                <option value="">Choose an exam...</option>
                {exams.map((exam) => (
                  <option key={exam.id} value={exam.id}>
                    {exam.id}
                  </option>
                ))}
              </select>
            </div>

            {/* Course Selection */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                <BookOpen className="w-4 h-4" />
                Select Course
              </label>
              <select
                value={selectedCourse}
                onChange={(e) => setSelectedCourse(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
              >
                <option value="">Choose a course...</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Refresh Button */}
            <div className="flex items-end">
              <button
                onClick={() => {
                  fetchCourses();
                  fetchExams();
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-all"
              >
                <Zap className="w-4 h-4" />
                Refresh Lists
              </button>
            </div>
          </div>
          
          {/* Slot and Part Configuration */}
          {selectedCourse && (
            <div className="border-t border-gray-200 pt-8">
              <h3 className="text-lg font-semibold text-gray-800 mb-6 flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Paper Configuration
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                    <Clock className="w-4 h-4" />
                    Slot (e.g., Morning, Afternoon, Slot 1, Slot 2)
                  </label>
                  <input
                    type="text"
                    value={slot}
                    onChange={(e) => setSlot(e.target.value)}
                    placeholder="Enter slot information"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  />
                </div>
                
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                    <BookOpen className="w-4 h-4" />
                    Part (e.g., Part A, Part B, Physics, Chemistry)
                  </label>
                  <input
                    type="text"
                    value={part}
                    onChange={(e) => setPart(e.target.value)}
                    placeholder="Enter part information"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>
              
              {/* Question Type Configuration */}
              <div>
                <h4 className="text-md font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <Award className="w-4 h-4" />
                  Question Types & Marking Scheme
                </h4>
                <p className="text-sm text-gray-600 mb-6">
                  Select the question types present in your PDFs and configure their marking schemes.
                </p>
                
                <div className="space-y-6">
                  {questionTypeConfigs.map((config) => (
                    <div key={config.type} className={`border rounded-xl p-6 transition-all ${
                      config.enabled ? 'border-purple-200 bg-purple-50' : 'border-gray-200 bg-gray-50'
                    }`}>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={config.enabled}
                            onChange={(e) => updateQuestionTypeConfig(config.type, 'enabled', e.target.checked)}
                            className="w-5 h-5 text-purple-600 rounded focus:ring-purple-500"
                          />
                          <div>
                            <h5 className="font-semibold text-gray-800">{config.type}</h5>
                            <p className="text-sm text-gray-600">
                              {config.type === 'MCQ' && 'Multiple Choice Questions (Single Correct)'}
                              {config.type === 'MSQ' && 'Multiple Select Questions (Multiple Correct)'}
                              {config.type === 'NAT' && 'Numerical Answer Type'}
                              {config.type === 'Subjective' && 'Descriptive/Subjective Questions'}
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      {config.enabled && (
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-2">
                              Correct Marks
                            </label>
                            <input
                              type="number"
                              value={config.correct_marks}
                              onChange={(e) => updateQuestionTypeConfig(config.type, 'correct_marks', parseFloat(e.target.value) || 0)}
                              step="0.1"
                              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            />
                          </div>
                          
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-2">
                              Incorrect Marks
                            </label>
                            <input
                              type="number"
                              value={config.incorrect_marks}
                              onChange={(e) => updateQuestionTypeConfig(config.type, 'incorrect_marks', parseFloat(e.target.value) || 0)}
                              step="0.1"
                              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            />
                          </div>
                          
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-2">
                              Skipped Marks
                            </label>
                            <input
                              type="number"
                              value={config.skipped_marks}
                              onChange={(e) => updateQuestionTypeConfig(config.type, 'skipped_marks', parseFloat(e.target.value) || 0)}
                              step="0.1"
                              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            />
                          </div>
                          
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-2">
                              Partial Marks
                            </label>
                            <input
                              type="number"
                              value={config.partial_marks}
                              onChange={(e) => updateQuestionTypeConfig(config.type, 'partial_marks', parseFloat(e.target.value) || 0)}
                              step="0.1"
                              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            />
                          </div>
                          
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-2">
                              Time (minutes)
                            </label>
                            <input
                              type="number"
                              value={config.time_minutes}
                              onChange={(e) => updateQuestionTypeConfig(config.type, 'time_minutes', parseFloat(e.target.value) || 0)}
                              step="0.1"
                              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                
                {getEnabledQuestionTypes().length > 0 && (
                  <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-xl">
                    <p className="text-green-800 font-medium">
                      ✅ Configured question types: {getEnabledQuestionTypes().map(c => c.type).join(', ')}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Multi-PDF Upload Areas */}
        {selectedCourse && slot.trim() && part.trim() && getEnabledQuestionTypes().length > 0 && (
          <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Upload PDF Files</h2>
            <p className="text-gray-600">
              Upload up to 20 PDF files. Each file should contain questions for a specific year.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pdfUploads.map((upload, index) => {
              const { getRootProps, getInputProps, isDragActive } = createDropzoneHandlers(index);
              
              return (
                <div key={upload.id} className="space-y-3">
                  <div
                    {...getRootProps()}
                    className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                      isDragActive
                        ? 'border-purple-400 bg-purple-50'
                        : upload.file
                        ? 'border-green-400 bg-green-50'
                        : 'border-gray-300 hover:border-purple-400 hover:bg-purple-50'
                    }`}
                  >
                    <input {...getInputProps()} />
                    
                    {upload.file ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-center">
                          <div className="p-2 bg-green-100 rounded-lg">
                            <Upload className="w-6 h-6 text-green-600" />
                          </div>
                        </div>
                        <p className="text-sm font-medium text-green-700 truncate">
                          {upload.file.name}
                        </p>
                        <p className="text-xs text-green-600">
                          {(upload.file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removePdf(index);
                          }}
                          className="absolute top-2 right-2 p-1 bg-red-100 hover:bg-red-200 rounded-full transition-colors"
                        >
                          <X className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-center">
                          <div className="p-2 bg-gray-100 rounded-lg">
                            <Upload className="w-6 h-6 text-gray-400" />
                          </div>
                        </div>
                        <p className="text-sm text-gray-600">
                          {isDragActive ? 'Drop PDF here...' : 'Click or drag PDF'}
                        </p>
                        <p className="text-xs text-gray-500">PDF files only</p>
                      </div>
                    )}
                  </div>

                  {upload.file && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Year for this PDF
                      </label>
                      <input
                        type="text"
                        value={upload.year}
                        onChange={(e) => updateYear(index, e.target.value)}
                        placeholder="e.g., 2023"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Summary */}
          {validPdfs.length > 0 && (
            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <p className="text-blue-800 font-medium">
                📊 Ready to process: {validPdfs.length} PDFs | Slot: {slot} | Part: {part}
              </p>
              <p className="text-blue-600 text-sm mt-1">
                Auto-save: {autoSaveEnabled ? 'enabled' : 'disabled'} | Question types: {getEnabledQuestionTypes().map(c => c.type).join(', ')}
              </p>
            </div>
          )}
          </div>
        )}

        {/* Action Buttons */}
        {selectedCourse && slot.trim() && part.trim() && getEnabledQuestionTypes().length > 0 && validPdfs.length > 0 && (
          <div className="flex gap-4 justify-center mb-8">
          <button
            onClick={scanAndExtractQuestions}
            disabled={isScanning}
            className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
          >
            <Eye className="w-5 h-5" />
            {isScanning ? '🔍 Scanning...' : '🔍 Scan & Extract Questions'}
          </button>

          {!autoSaveEnabled && (
            <button
              onClick={saveAllToDatabase}
              disabled={extractedQuestions.length === 0 || isSaving}
              className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              <Database className="w-5 h-5" />
              {isSaving ? '💾 Saving...' : '💾 Save All to Database'}
            </button>
          )}
          </div>
        )}

        {/* Progress Indicator */}
        {isScanning && scanProgress.totalPdfs > 0 && (
          <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
            <div className="text-center mb-6">
              <h3 className="text-xl font-semibold text-gray-800 mb-2">Processing PDFs...</h3>
              <p className="text-gray-600">
                PDF {scanProgress.currentPdf} of {scanProgress.totalPdfs}
              </p>
            </div>
            
            <div className="space-y-4">
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className="bg-gradient-to-r from-purple-600 to-indigo-600 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${(scanProgress.currentPdf / scanProgress.totalPdfs) * 100}%` }}
                ></div>
              </div>
              
              <div className="text-center space-y-2">
                <p className="font-medium text-gray-800">
                  {scanProgress.currentPdfName}
                </p>
                <p className="text-sm text-gray-600">
                  {scanProgress.status}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        {extractedQuestions.length > 0 && (
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-800">
                Extracted Questions ({extractedQuestions.length})
              </h2>
              <div className="text-sm text-gray-600">
                {autoSaveEnabled ? '✅ Auto-saved to database' : '⚠️ Not saved yet'}
              </div>
            </div>
            
            <div className="space-y-6">
              {extractedQuestions.map((question, index) => (
                <QuestionPreview key={index} question={question} index={index} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}